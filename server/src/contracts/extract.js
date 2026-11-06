/*
 * Stage 4, step 18: get the text out of an uploaded contract.
 *
 * Supported formats: PDF (with a text layer), Word (.docx) and plain text.
 * Scanned PDFs have no text layer; we tell the buyer instead of guessing.
 */
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';

export const CONTRACT_FORMATS = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

export const MAX_CONTRACT_BYTES = 15 * 1024 * 1024;

// Fewer readable characters than this means the file is probably a scan.
const MIN_TEXT_LENGTH = 200;

export class UnreadableContractError extends Error {}

/**
 * @param {Buffer} file
 * @param {'pdf'|'docx'|'txt'} extension
 * @returns {Promise<{ pages: string[], pageCount: number, wordCount: number }>}
 */
export async function extractContractText(file, extension) {
  let pages;

  if (extension === 'pdf') {
    pages = await readPdf(file);
  } else if (extension === 'docx') {
    pages = [await readWord(file)];
  } else {
    pages = [file.toString('utf8')];
  }

  const allText = pages.join('\n').trim();
  if (allText.length < MIN_TEXT_LENGTH) {
    throw new UnreadableContractError(
      'We could not read enough text from this file. If it is a scanned document, please upload a text-based PDF or a Word file.',
    );
  }

  return {
    pages,
    pageCount: pages.length,
    wordCount: allText.split(/\s+/).length,
  };
}

async function readPdf(file) {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(file));
    const { text } = await extractText(pdf, { mergePages: false });
    return text;
  } catch {
    throw new UnreadableContractError(
      'This PDF could not be opened. It may be damaged or password protected.',
    );
  }
}

async function readWord(file) {
  try {
    const { value } = await mammoth.extractRawText({ buffer: file });
    return value;
  } catch {
    throw new UnreadableContractError(
      'This Word file could not be opened. Please check it opens in Word and try again.',
    );
  }
}
