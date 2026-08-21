import { createHash } from 'node:crypto'
import { z } from 'zod'

import { fixedIncomeSourceProvenanceSchema, type FixedIncomeSourceProvenance } from './providers/provider-contract.js'

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const metadataSchema = z.object({
  fileName: z.string().trim().min(1).max(256),
  contentType: z.enum(['text/plain', 'text/csv', 'application/json', 'text/html', 'application/pdf']),
  sourceKind: z.enum(['cvm_official_download', 'anbima_manual_download', 'user_supplied']),
  sourceUrl: z.string().url().max(2_048), observedAt: z.string().datetime({ offset: true }),
  dataAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/), termsReviewedAt: z.string().date(),
}).strict()

export interface PrivateCreditDocumentIngestion {
  fileName: string
  contentType: string
  byteLength: number
  documentHash: string
  extractionState: 'text_extracted' | 'binary_pending_extraction'
  extractedText?: string
  trust: 'untrusted_document_content'
  securitySignals: string[]
  provenance: FixedIncomeSourceProvenance
}

export interface PrivateCreditPdfExtraction {
  extractionState: 'text_extracted'
  pageCount: number
  extractedText: string
  pages: Array<{ page: number; startOffset: number; endOffset: number }>
  securitySignals: string[]
  extractorVersion: 'pdfjs-dist@6.2.108/private-credit@1'
}

export function ingestPrivateCreditDocument(bytes: Uint8Array, metadataInput: z.input<typeof metadataSchema>): PrivateCreditDocumentIngestion {
  const metadata = metadataSchema.parse(metadataInput)
  const sourceHost = new URL(metadata.sourceUrl).hostname.toLowerCase()
  if (metadata.sourceKind === 'cvm_official_download' && !['dados.cvm.gov.br', 'www.rad.cvm.gov.br', 'rad.cvm.gov.br'].includes(sourceHost)) throw new Error('CVM evidence must use an official CVM source URL')
  if (metadata.sourceKind === 'anbima_manual_download' && !(sourceHost === 'anbima.com.br' || sourceHost.endsWith('.anbima.com.br'))) throw new Error('ANBIMA evidence must use an official ANBIMA source URL')
  if (metadata.fileName.includes('..') || /[\\/:]/.test(metadata.fileName) || metadata.fileName !== metadata.fileName.split(/[\\/]/).at(-1)) {
    throw new Error('document file name must not contain traversal or path separators')
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('document size must be between 1 byte and 10 MiB')
  if (isArchive(bytes)) throw new Error('archive documents are not accepted; extract and inspect one bounded file at a time')
  if (metadata.contentType === 'application/pdf' && !startsWith(bytes, '%PDF-')) throw new Error('PDF content type does not match file signature')
  const documentHash = createHash('sha256').update(bytes).digest('hex')
  const isText = metadata.contentType !== 'application/pdf'
  let extractedText: string | undefined
  const securitySignals: string[] = []
  if (isText) {
    try { extractedText = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw new Error('text document must be valid UTF-8') }
    if (metadata.contentType === 'application/json') {
      try { JSON.parse(extractedText) } catch { throw new Error('JSON document is malformed') }
    }
    if (metadata.contentType === 'text/html') {
      if (/<\s*(script|iframe|object|embed|style|form|link|meta)\b|\son\w+\s*=|javascript\s*:/i.test(extractedText)) throw new Error('active HTML content is not accepted')
      extractedText = extractedText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    securitySignals.push(...textSecuritySignals(extractedText))
  }
  const sourcePolicy = {
    cvm_official_download: { publisher: 'Comissão de Valores Mobiliários', decision: 'automate' as const, access: 'official_public_download' as const, method: 'GET' as const, license: 'open_data' as const, version: 'cvm-open-data-odbl@2026-08-20' },
    anbima_manual_download: { publisher: 'ANBIMA manual public download', decision: 'manual' as const, access: 'official_public_download' as const, method: 'manual_upload' as const, license: 'terms_review_required' as const, version: 'anbima-public-manual-only@2026-08-20' },
    user_supplied: { publisher: 'User supplied private-credit document', decision: 'manual' as const, access: 'user_supplied' as const, method: 'manual_upload' as const, license: 'user_supplied' as const, version: 'user-supplied-private-evidence@1' },
  }[metadata.sourceKind]
  const provenance = fixedIncomeSourceProvenanceSchema.parse({
    publisher: sourcePolicy.publisher, sourceId: `${metadata.sourceKind}:${documentHash.slice(0, 16)}`, sourceUrl: metadata.sourceUrl,
    decision: sourcePolicy.decision, access: sourcePolicy.access, method: sourcePolicy.method, parameters: { fileName: metadata.fileName },
    license: sourcePolicy.license, termsReviewedAt: metadata.termsReviewedAt, termsVersion: sourcePolicy.version,
    retrievedAt: metadata.observedAt, dataAsOf: metadata.dataAsOf, rawPayloadChecksum: documentHash,
    parserVersion: 'private-credit-document-ingestion@1', originalIdentifiers: { fileName: metadata.fileName },
  })
  return {
    fileName: metadata.fileName, contentType: metadata.contentType, byteLength: bytes.byteLength, documentHash,
    extractionState: isText ? 'text_extracted' : 'binary_pending_extraction', ...(extractedText !== undefined ? { extractedText } : {}),
    trust: 'untrusted_document_content', securitySignals, provenance,
  }
}

export async function extractPrivateCreditPdfText(bytes: Uint8Array, options: { maxPages?: number; maxCharacters?: number; timeoutMs?: number } = {}): Promise<PrivateCreditPdfExtraction> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('PDF size must be between 1 byte and 10 MiB')
  if (!startsWith(bytes, '%PDF-')) throw new Error('PDF content does not match file signature')
  const maxPages = options.maxPages ?? 100
  const maxCharacters = options.maxCharacters ?? 500_000
  const timeoutMs = options.timeoutMs ?? 15_000
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 500) throw new Error('PDF maxPages must be between 1 and 500')
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1 || maxCharacters > 2_000_000) throw new Error('PDF maxCharacters must be between 1 and 2000000')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) throw new Error('PDF timeoutMs must be between 100 and 60000')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: Uint8Array.from(bytes), useWasm: false, disableFontFace: true, isImageDecoderSupported: false })
  let timer: NodeJS.Timeout | undefined
  try {
    const document = await Promise.race([
      task.promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('PDF extraction timed out')), timeoutMs) }),
    ])
    if (document.numPages > maxPages) throw new Error(`PDF has ${document.numPages} pages; maximum is ${maxPages}`)
    const parts: string[] = []
    const pages: PrivateCreditPdfExtraction['pages'] = []
    let length = 0
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items.map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '')).join('').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim()
      const separator = parts.length ? '\n\n' : ''
      const nextLength = length + separator.length + text.length
      if (nextLength > maxCharacters) throw new Error(`PDF extracted text exceeds ${maxCharacters} characters`)
      const startOffset = length + separator.length
      parts.push(`${separator}${text}`)
      length = nextLength
      pages.push({ page: pageNumber, startOffset, endOffset: length })
      page.cleanup()
    }
    const extractedText = parts.join('')
    return { extractionState: 'text_extracted', pageCount: document.numPages, extractedText, pages, securitySignals: textSecuritySignals(extractedText), extractorVersion: 'pdfjs-dist@6.2.108/private-credit@1' }
  } finally {
    if (timer) clearTimeout(timer)
    await task.destroy().catch(() => undefined)
  }
}

export async function ingestPrivateCreditDocumentWithExtraction(bytes: Uint8Array, metadataInput: z.input<typeof metadataSchema>, options: { maxPages?: number; maxCharacters?: number; timeoutMs?: number } = {}): Promise<PrivateCreditDocumentIngestion | (PrivateCreditDocumentIngestion & PrivateCreditPdfExtraction)> {
  const ingestion = ingestPrivateCreditDocument(bytes, metadataInput)
  if (ingestion.contentType !== 'application/pdf') return ingestion
  const extraction = await extractPrivateCreditPdfText(bytes, options)
  return { ...ingestion, ...extraction, securitySignals: [...new Set([...ingestion.securitySignals, ...extraction.securitySignals])] }
}

function isArchive(bytes: Uint8Array): boolean {
  return (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0x1f && bytes[1] === 0x8b) || startsWith(bytes, 'Rar!') || startsWith(bytes, '7z')
}
function startsWith(bytes: Uint8Array, prefix: string): boolean {
  const expected = Buffer.from(prefix, 'ascii')
  return expected.every((value, index) => bytes[index] === value)
}
function textSecuritySignals(text: string): string[] {
  return /ignore\s+(all\s+)?previous\s+instructions|system\s+prompt|set\s+(the\s+)?score\s+to|<\|(?:system|assistant|user)\|>/i.test(text) ? ['prompt_injection_like_text'] : []
}
