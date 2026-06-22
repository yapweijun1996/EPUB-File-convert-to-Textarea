function parseXml(xml, label) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`Invalid ${label} XML.`);
  }
  return doc;
}

function findFirstByLocalName(document, localName) {
  const byTagName = document.getElementsByTagName(localName);
  if (byTagName.length) return byTagName[0];

  const all = document.getElementsByTagName('*');
  for (const node of all) {
    if (node.localName === localName) return node;
  }
  return null;
}

function findAllByLocalName(document, localName) {
  const byTagName = Array.from(document.getElementsByTagName(localName));
  if (byTagName.length) return byTagName;

  return Array.from(document.getElementsByTagName('*')).filter((node) => node.localName === localName);
}

function resolveEpubPath(baseDir, href) {
  const rawPath = href.split('#')[0];
  let decodedPath = rawPath;

  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch (_) {
    decodedPath = rawPath;
  }

  const parts = `${baseDir}${decodedPath}`.split('/');
  const stack = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }

  return stack.join('/');
}

function extractTextFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, svg, nav').forEach((node) => node.remove());

  const body = doc.body;
  if (!body) return '';

  return body.innerText
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readZipText(zip, path, label) {
  const file = zip.file(path);
  if (!file) {
    throw new Error(`${label} not found: ${path}`);
  }
  return file.async('string');
}

export async function parseEpubToText(file, options = {}) {
  if (!window.JSZip) {
    throw new Error('JSZip is not loaded. Check your internet connection for first load, then reload the app.');
  }

  if (!file || !file.name.toLowerCase().endsWith('.epub')) {
    throw new Error('Please upload a valid .epub file.');
  }

  const maxFileSize = options.maxFileSize || 50 * 1024 * 1024;
  if (file.size > maxFileSize) {
    throw new Error('This EPUB is too large for the demo guardrail. Try a file under 50 MB.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const zip = await window.JSZip.loadAsync(arrayBuffer);

  const containerXml = await readZipText(zip, 'META-INF/container.xml', 'EPUB container');
  const containerDoc = parseXml(containerXml, 'container');
  const rootfileElement = findFirstByLocalName(containerDoc, 'rootfile');
  const rootfilePath = rootfileElement?.getAttribute('full-path');

  if (!rootfilePath) {
    throw new Error('OPF rootfile path was not found in container.xml.');
  }

  const opfXml = await readZipText(zip, rootfilePath, 'OPF package file');
  const opfDoc = parseXml(opfXml, 'OPF');
  const manifestElement = findFirstByLocalName(opfDoc, 'manifest');
  const spineElement = findFirstByLocalName(opfDoc, 'spine');
  const manifestItems = manifestElement ? findAllByLocalName(manifestElement, 'item') : [];
  const spineItems = spineElement ? findAllByLocalName(spineElement, 'itemref') : [];

  const manifestById = new Map(
    manifestItems.map((entry) => [entry.getAttribute('id'), entry])
  );

  const baseDir = rootfilePath.includes('/') ? rootfilePath.slice(0, rootfilePath.lastIndexOf('/') + 1) : '';

  if (!spineItems.length) {
    throw new Error('No readable spine items found in this EPUB.');
  }

  const chapterPromises = spineItems.map(async (itemref, index) => {
    const idref = itemref.getAttribute('idref');
    const item = manifestById.get(idref);
    if (!item) return { index, text: '', path: '' };

    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type') || '';
    if (!href || !/xhtml|html/i.test(mediaType + href)) {
      return { index, text: '', path: href || '' };
    }

    const chapterPath = resolveEpubPath(baseDir, href);
    const zipFile = zip.file(chapterPath);
    if (!zipFile) {
      console.warn(`Missing chapter file: ${chapterPath}`);
      return { index, text: '', path: chapterPath };
    }

    const html = await zipFile.async('string');
    return {
      index,
      path: chapterPath,
      text: extractTextFromHtml(html)
    };
  });

  const chapters = (await Promise.all(chapterPromises))
    .sort((a, b) => a.index - b.index)
    .filter((chapter) => chapter.text.trim());

  const separator = options.separator === 'none' ? '\n\n' : '\n\n--- Chapter Break ---\n\n';
  const text = chapters.map((chapter) => chapter.text).join(separator).trim();

  return {
    text,
    chapterCount: chapters.length,
    sourceCount: spineItems.length,
    fileName: file.name,
    fileSize: file.size
  };
}
