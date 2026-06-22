import { addHistory, clearHistory, deleteHistory, listHistory } from './db.js';
import { parseEpubToText } from './epubParser.js';
import { loadPreferences, savePreferences } from './storage.js';
import { estimatePartCount, splitTextByParagraph } from './textSplitter.js';
import { escapeHtml, formatBytes, formatNumber, showToast } from './ui.js';

const refs = {
  appShell: document.getElementById('appShell'),
  sidebar: document.getElementById('sidebar'),
  mobileOverlay: document.getElementById('mobileOverlay'),
  mobileMenuButton: document.getElementById('mobileMenuButton'),
  navItems: document.querySelectorAll('.nav-item'),
  fileInput: document.getElementById('fileInput'),
  dropZone: document.getElementById('dropZone'),
  content: document.getElementById('content'),
  copyButton: document.getElementById('copyButton'),
  saveButton: document.getElementById('saveButton'),
  clearButton: document.getElementById('clearButton'),
  clearHistoryButton: document.getElementById('clearHistoryButton'),
  sampleButton: document.getElementById('sampleButton'),
  maxChars: document.getElementById('maxChars'),
  separatorSelect: document.getElementById('separatorSelect'),
  chapterCount: document.getElementById('chapterCount'),
  charCount: document.getElementById('charCount'),
  partCount: document.getElementById('partCount'),
  statusText: document.getElementById('statusText'),
  fileMeta: document.getElementById('fileMeta'),
  historyBody: document.getElementById('historyBody'),
  themeButton: document.getElementById('themeButton'),
  installButton: document.getElementById('installButton'),
  swDot: document.getElementById('swDot'),
  swStatus: document.getElementById('swStatus')
};

const ICONS = {
  moon: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4a7 7 0 1 0 11.5 11.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>`,
  sun: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8"/>
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`
};

let currentFileName = '';
let deferredInstallPrompt = null;
const isMobileLayout = () => window.matchMedia('(max-width: 760px)').matches;

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  refs.themeButton.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
  refs.themeButton.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  savePreferences({ theme });
}

function getMaxChars() {
  return Math.max(1000, Number.parseInt(refs.maxChars.value, 10) || 10000);
}

function updateMetrics({ chapterCount = 0, text = '', fileName = '', fileSize = 0, status = 'Ready' } = {}) {
  const partCount = estimatePartCount(text, getMaxChars());
  refs.chapterCount.textContent = formatNumber(chapterCount);
  refs.charCount.textContent = formatNumber(text.length);
  refs.partCount.textContent = formatNumber(partCount);
  refs.statusText.textContent = status;
  refs.fileMeta.textContent = fileName ? `${fileName} · ${formatBytes(fileSize)}` : 'No file selected';
  refs.copyButton.disabled = !text;
  refs.saveButton.disabled = !text;
  refs.clearButton.disabled = !text;
}

function setBusy(isBusy, label = 'Processing') {
  refs.statusText.textContent = isBusy ? label : 'Ready';
  refs.fileInput.disabled = isBusy;
  refs.copyButton.disabled = isBusy || !refs.content.value;
  refs.saveButton.disabled = isBusy || !refs.content.value;
}

async function handleFile(file) {
  try {
    setBusy(true, 'Reading EPUB');
    refs.content.value = '';
    updateMetrics({ status: 'Reading EPUB', fileName: file.name, fileSize: file.size });

    const result = await parseEpubToText(file, {
      separator: refs.separatorSelect.value
    });

    currentFileName = result.fileName;
    refs.content.value = result.text || 'No readable content found.';
    updateMetrics({
      chapterCount: result.chapterCount,
      text: result.text,
      fileName: result.fileName,
      fileSize: result.fileSize,
      status: 'Done'
    });

    const parts = estimatePartCount(result.text, getMaxChars());
    await addHistory({
      fileName: result.fileName,
      fileSize: result.fileSize,
      chapterCount: result.chapterCount,
      sourceCount: result.sourceCount,
      charCount: result.text.length,
      partCount: parts,
      preview: result.text.slice(0, 600)
    });
    await renderHistory();
    showToast('EPUB converted', `${result.chapterCount} chapters extracted from ${result.fileName}.`);
  } catch (error) {
    console.error(error);
    refs.content.value = '';
    updateMetrics({ status: 'Failed' });
    showToast('Conversion failed', error.message || 'Unable to parse this EPUB.');
  } finally {
    setBusy(false);
  }
}

async function copyContent() {
  const text = refs.content.value;
  if (!text) return;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      refs.content.select();
      const ok = document.execCommand('copy');
      if (!ok) throw new Error('Copy command failed.');
    }
    showToast('Copied', 'Textarea content copied to clipboard.');
  } catch (error) {
    console.error(error);
    showToast('Copy failed', 'Your browser blocked clipboard access.');
  }
}

async function saveZip() {
  const text = refs.content.value.trim();
  if (!text) {
    showToast('Nothing to save', 'Convert an EPUB first.');
    return;
  }

  if (!window.JSZip) {
    showToast('JSZip missing', 'Reload while online so the ZIP library can load.');
    return;
  }

  const maxChars = getMaxChars();
  const parts = splitTextByParagraph(text, maxChars);
  const zip = new window.JSZip();
  const baseName = currentFileName ? currentFileName.replace(/\.epub$/i, '') : 'epub-content';

  parts.forEach((part, index) => {
    zip.file(`${baseName}_part_${String(index + 1).padStart(2, '0')}.txt`, part);
  });

  try {
    refs.saveButton.disabled = true;
    refs.saveButton.textContent = 'Preparing ZIP...';
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${baseName}_txt_parts.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('ZIP ready', `${parts.length} TXT part(s) generated.`);
  } catch (error) {
    console.error(error);
    showToast('Save failed', 'Could not generate ZIP file.');
  } finally {
    refs.saveButton.textContent = 'Save ZIP';
    refs.saveButton.disabled = !refs.content.value;
  }
}

function clearCurrent() {
  refs.fileInput.value = '';
  refs.content.value = '';
  currentFileName = '';
  updateMetrics();
  showToast('Cleared', 'Current textarea content removed.');
}

function setMobileMenuOpen(isOpen) {
  const wasOpen = refs.appShell.classList.contains('is-menu-open');
  const mobile = isMobileLayout();
  const shouldOpen = Boolean(isOpen && mobile);

  refs.appShell.classList.toggle('is-menu-open', shouldOpen);
  refs.mobileMenuButton.setAttribute('aria-expanded', String(shouldOpen));
  refs.sidebar.setAttribute('aria-hidden', String(mobile && !shouldOpen));
  refs.mobileOverlay.hidden = !shouldOpen;
  document.body.style.overflow = shouldOpen ? 'hidden' : '';

  if (shouldOpen) {
    const firstItem = refs.sidebar.querySelector('.nav-item');
    if (firstItem) {
      try {
        firstItem.focus({ preventScroll: true });
      } catch {
        firstItem.focus();
      }
    }
    return;
  }

  if (wasOpen && mobile) {
    try {
      refs.mobileMenuButton.focus({ preventScroll: true });
    } catch {
      refs.mobileMenuButton.focus();
    }
  }
}

function syncNavStateFromHash() {
  const targetHash = refs.navItems.length
    ? Array.from(refs.navItems).find((item) => item.getAttribute('href') === window.location.hash) || refs.navItems[0]
    : null;
  const activeHash = targetHash ? targetHash.getAttribute('href') : '#converter';

  refs.navItems.forEach((item) => {
    const isActive = item.getAttribute('href') === activeHash;
    item.classList.toggle('is-active', isActive);
    if (isActive) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });
}

async function loadSample() {
  currentFileName = 'sample-business-book.epub';
  const sample = [
    'Chapter 1 — Executive Overview',
    'This is a sample output to demonstrate the admin panel layout, paragraph-aware text splitting, and IndexedDB history behavior.',
    'Chapter 2 — Operational Notes',
    'For a real EPUB upload, the parser reads META-INF/container.xml, resolves the OPF package, follows the spine order, extracts XHTML body text, and renders it here.',
    'Chapter 3 — Export',
    'Click Save ZIP to split this text into TXT files based on the configured max character limit.'
  ].join('\n\n');

  refs.content.value = sample;
  updateMetrics({ chapterCount: 3, text: sample, fileName: currentFileName, fileSize: sample.length, status: 'Sample' });
  try {
    await addHistory({
      fileName: currentFileName,
      fileSize: sample.length,
      chapterCount: 3,
      sourceCount: 3,
      charCount: sample.length,
      partCount: estimatePartCount(sample, getMaxChars()),
      preview: sample.slice(0, 600)
    });
    await renderHistory();
    showToast('Sample loaded', 'Demo content added to the textarea and history.');
  } catch (error) {
    console.error(error);
    showToast('Sample loaded', 'Could not save sample to history.');
  }
}

async function renderHistory() {
  try {
    const rows = await listHistory(20);
    if (!rows.length) {
      refs.historyBody.innerHTML = '<tr><td colspan="6" class="empty-cell">No conversion history yet.</td></tr>';
      return;
    }

    refs.historyBody.innerHTML = rows.map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.fileName)}</strong><br><small>${formatBytes(row.fileSize)}</small></td>
        <td>${formatNumber(row.chapterCount)}</td>
        <td>${formatNumber(row.charCount)}</td>
        <td>${formatNumber(row.partCount)}</td>
        <td>${new Date(row.createdAt).toLocaleString()}</td>
        <td><button class="ghost-button compact" data-delete-id="${row.id}" type="button">Delete</button></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error(error);
    refs.historyBody.innerHTML = '<tr><td colspan="6" class="empty-cell">Could not load IndexedDB history.</td></tr>';
  }
}

function bindEvents() {
  refs.fileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    refs.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      refs.dropZone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    refs.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      refs.dropZone.classList.remove('is-dragover');
    });
  });

  refs.dropZone.addEventListener('drop', (event) => {
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  });

  refs.copyButton.addEventListener('click', copyContent);
  refs.saveButton.addEventListener('click', saveZip);
  refs.clearButton.addEventListener('click', clearCurrent);
  refs.sampleButton.addEventListener('click', loadSample);

  refs.maxChars.addEventListener('change', () => {
    savePreferences({ maxChars: getMaxChars() });
    updateMetrics({ text: refs.content.value, fileName: currentFileName, fileSize: refs.content.value.length, status: refs.content.value ? 'Updated' : 'Ready' });
  });

  refs.separatorSelect.addEventListener('change', () => {
    savePreferences({ separator: refs.separatorSelect.value });
  });

  refs.themeButton.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  });

  refs.clearHistoryButton.addEventListener('click', async () => {
    await clearHistory();
    await renderHistory();
    showToast('History cleared', 'IndexedDB conversion history removed.');
  });

  refs.historyBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-id]');
    if (!button) return;
    await deleteHistory(button.dataset.deleteId);
    await renderHistory();
    showToast('History row deleted', 'One conversion record was removed.');
  });

  refs.mobileMenuButton.addEventListener('click', () => {
    const isOpen = refs.appShell.classList.contains('is-menu-open');
    setMobileMenuOpen(!isOpen);
  });

  refs.mobileOverlay.addEventListener('click', closeMobileMenu);
  refs.navItems.forEach((item) => item.addEventListener('click', closeMobileMenu));
  window.addEventListener('hashchange', syncNavStateFromHash);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMobileMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (!isMobileLayout()) {
      closeMobileMenu();
    }
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    refs.installButton.hidden = false;
  });

  refs.installButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    refs.installButton.hidden = true;
  });
}

function closeMobileMenu() {
  setMobileMenuOpen(false);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    refs.swStatus.textContent = 'PWA unsupported';
    return;
  }

  try {
    await navigator.serviceWorker.register('./sw.js');
    refs.swDot.classList.add('is-ready');
    refs.swStatus.textContent = 'PWA ready';
  } catch (error) {
    console.error(error);
    refs.swStatus.textContent = 'PWA registration failed';
  }
}

function boot() {
  const preferences = loadPreferences();
  refs.maxChars.value = preferences.maxChars;
  refs.separatorSelect.value = preferences.separator;
  setTheme(preferences.theme);
  updateMetrics();
  setMobileMenuOpen(false);
  syncNavStateFromHash();
  bindEvents();
  renderHistory();
  registerServiceWorker();
}

boot();
