export function splitTextByParagraph(text, maxChars) {
  const safeMax = Number.isFinite(maxChars) && maxChars >= 1000 ? maxChars : 10000;
  const paragraphs = text.split(/\n\s*\n/g);
  const parts = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const block = paragraph.trim();
    if (!block) continue;

    if (block.length > safeMax) {
      if (current.trim()) {
        parts.push(current.trim());
        current = '';
      }
      for (let i = 0; i < block.length; i += safeMax) {
        parts.push(block.slice(i, i + safeMax));
      }
      continue;
    }

    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > safeMax) {
      if (current.trim()) parts.push(current.trim());
      current = block;
    } else {
      current = next;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function estimatePartCount(text, maxChars) {
  if (!text.trim()) return 0;
  return splitTextByParagraph(text, maxChars).length;
}
