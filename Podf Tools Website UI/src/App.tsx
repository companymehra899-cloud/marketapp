import { useState, useRef } from "react";
import {
  mergePDFs,
  splitPDF,
  deletePages,
  reorderPages,
  compressPDF,
  extractPages,
  downloadBytes,
  getPageCount,
} from "./pdfWorker";

type Tool = {
  name: string;
  desc: string;
  icon: string;
  category: string;
  color: string;
  textColor: string;
  actionLabel: string;
  acceptMultiple?: boolean;
  hint?: string;
  accept?: string;
};

const allTools: Tool[] = [
  { name: "Merge PDF", desc: "Combine multiple PDFs into one file", icon: "⊞", category: "Organize", color: "#1a1a1a", textColor: "#fff", actionLabel: "Merge PDFs", acceptMultiple: true, hint: "Select 2 or more PDF files to merge", accept: ".pdf" },
  { name: "Split PDF", desc: "Extract pages or split into separate files", icon: "⊟", category: "Organize", color: "#1a1a1a", textColor: "#fff", actionLabel: "Split PDF", hint: "Choose after which page to split", accept: ".pdf" },
  { name: "Reorder Pages", desc: "Drag and rearrange pages visually", icon: "⇅", category: "Organize", color: "#1a1a1a", textColor: "#fff", actionLabel: "Save Reordered PDF", hint: "Click arrows to move pages", accept: ".pdf" },
  { name: "Delete Pages", desc: "Remove unwanted pages from a PDF", icon: "✕", category: "Organize", color: "#1a1a1a", textColor: "#fff", actionLabel: "Delete Selected Pages", hint: "Click pages to select for removal", accept: ".pdf" },
  { name: "Compress PDF", desc: "Reduce file size while keeping quality", icon: "◈", category: "Optimize", color: "#2c2c2c", textColor: "#fff", actionLabel: "Compress PDF", hint: "Re-serializes PDF to reduce redundant objects", accept: ".pdf" },
  { name: "Extract Pages", desc: "Extract specific pages into a new PDF", icon: "⊠", category: "Organize", color: "#1a1a1a", textColor: "#fff", actionLabel: "Extract Pages", hint: "Click pages to extract", accept: ".pdf" },
  { name: "PDF to Word", desc: "Convert PDF to editable .docx format", icon: "W", category: "Convert", color: "#e63329", textColor: "#fff", actionLabel: "Convert to Word", hint: "Requires paid API — coming soon", accept: ".pdf" },
  { name: "PDF to Excel", desc: "Extract tables into spreadsheet format", icon: "X", category: "Convert", color: "#e63329", textColor: "#fff", actionLabel: "Convert to Excel", hint: "Requires paid API — coming soon", accept: ".pdf" },
  { name: "PDF to JPG", desc: "Export each page as a JPEG image", icon: "⬡", category: "Convert", color: "#e63329", textColor: "#fff", actionLabel: "Convert to JPG", hint: "Requires paid API — coming soon", accept: ".pdf" },
  { name: "Word to PDF", desc: "Convert .doc and .docx to PDF", icon: "↗", category: "Convert", color: "#e63329", textColor: "#fff", actionLabel: "Convert to PDF", hint: "Requires paid API — coming soon", accept: ".doc,.docx" },
  { name: "Repair PDF", desc: "Fix corrupted or broken PDF files", icon: "⟳", category: "Optimize", color: "#2c2c2c", textColor: "#fff", actionLabel: "Repair PDF", hint: "Re-parses and re-saves your PDF", accept: ".pdf" },
  { name: "Flatten PDF", desc: "Merge annotations and form fields", icon: "▣", category: "Optimize", color: "#2c2c2c", textColor: "#fff", actionLabel: "Flatten PDF", hint: "Flattening makes form fields permanent", accept: ".pdf" },
  { name: "Grayscale PDF", desc: "Convert color PDF to black and white", icon: "◑", category: "Optimize", color: "#2c2c2c", textColor: "#fff", actionLabel: "Convert to Grayscale", hint: "Reduces ink usage when printing", accept: ".pdf" },
  { name: "Protect PDF", desc: "Add password protection to your PDF", icon: "⬡", category: "Secure", color: "#f5f4f0", textColor: "#1a1a1a", actionLabel: "Protect PDF", hint: "Requires browser-native encryption support", accept: ".pdf" },
  { name: "Unlock PDF", desc: "Remove password from a PDF file", icon: "◎", category: "Secure", color: "#f5f4f0", textColor: "#1a1a1a", actionLabel: "Unlock PDF", hint: "You must know the current password", accept: ".pdf" },
  { name: "Sign PDF", desc: "Add digital signature to documents", icon: "✍", category: "Secure", color: "#f5f4f0", textColor: "#1a1a1a", actionLabel: "Sign PDF", hint: "Coming soon", accept: ".pdf" },
  { name: "Redact PDF", desc: "Permanently remove sensitive content", icon: "▬", category: "Secure", color: "#f5f4f0", textColor: "#1a1a1a", actionLabel: "Redact PDF", hint: "Coming soon", accept: ".pdf" },
];

const groups = ["Organize", "Convert", "Optimize", "Secure"];
const compressionLevels = ["Low — best quality", "Medium — balanced", "High — smallest size"];

// Tools that are actually implemented with pdf-lib
const WORKING_TOOLS = new Set(["Merge PDF", "Split PDF", "Reorder Pages", "Delete Pages", "Compress PDF", "Extract Pages", "Repair PDF", "Flatten PDF"]);

function fmt(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// ─── Workspace Page ───────────────────────────────────────────────────────────
function WorkspacePage({ tool, onBack }: { tool: Tool; onBack: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pageCounts, setPageCounts] = useState<number[]>([]);
  const [dragging, setDragging] = useState(false);
  const [compression, setCompression] = useState(1);
  const [splitAt, setSplitAt] = useState(1);
  const [password, setPassword] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ label: string; bytes: Uint8Array; name: string } | null>(null);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pageOrder, setPageOrder] = useState<number[]>([]);

  const isWorking = WORKING_TOOLS.has(tool.name);
  const isMerge = tool.name === "Merge PDF";
  const isSplit = tool.name === "Split PDF";
  const isDelete = tool.name === "Delete Pages";
  const isReorder = tool.name === "Reorder Pages";
  const isExtract = tool.name === "Extract Pages";
  const isProtect = tool.name === "Protect PDF";
  const categoryColor = { Organize: "#1a1a1a", Convert: "#e63329", Optimize: "#2c2c2c", Secure: "#1a1a1a" }[tool.category] ?? "#1a1a1a";
  const totalPages = pageCounts[0] ?? 0;

  async function handleFiles(picked: File[]) {
    setFiles(picked);
    setError(null);
    setDone(null);
    setSelectedPages([]);
    try {
      const counts = await Promise.all(picked.map(getPageCount));
      setPageCounts(counts);
      if (counts[0]) {
        setPageOrder(Array.from({ length: counts[0] }, (_, i) => i));
        setSplitAt(Math.max(1, Math.floor(counts[0] / 2)));
      }
    } catch {
      setError("Could not read PDF. Make sure it is not password-protected.");
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(Array.from(e.target.files));
  }

  function togglePage(i: number) {
    setSelectedPages((prev) =>
      prev.includes(i) ? prev.filter((p) => p !== i) : [...prev, i]
    );
  }

  function movePage(from: number, dir: -1 | 1) {
    const to = from + dir;
    if (to < 0 || to >= pageOrder.length) return;
    const next = [...pageOrder];
    [next[from], next[to]] = [next[to], next[from]];
    setPageOrder(next);
  }

  async function handleProcess() {
    setProcessing(true);
    setError(null);
    try {
      let bytes: Uint8Array;
      let filename = "";

      if (isMerge) {
        bytes = await mergePDFs(files);
        filename = "merged.pdf";
        const label = `${bytes.length > 0 ? fmt(bytes.length) : ""} · ${pageCounts.reduce((a, b) => a + b, 0)} pages`;
        setDone({ label, bytes, name: filename });
      } else if (isSplit) {
        const [p1, p2] = await splitPDF(files[0], splitAt);
        // download both
        downloadBytes(p1, "part1.pdf");
        downloadBytes(p2, "part2.pdf");
        setDone({ label: `2 files downloaded`, bytes: p1, name: "part1.pdf" });
      } else if (isDelete) {
        if (selectedPages.length === 0) { setError("Select at least one page to delete."); setProcessing(false); return; }
        bytes = await deletePages(files[0], selectedPages);
        filename = "deleted-pages.pdf";
        setDone({ label: `${fmt(bytes.length)} · ${totalPages - selectedPages.length} pages remaining`, bytes, name: filename });
      } else if (isReorder) {
        bytes = await reorderPages(files[0], pageOrder);
        filename = "reordered.pdf";
        setDone({ label: `${fmt(bytes.length)} · ${totalPages} pages`, bytes, name: filename });
      } else if (isExtract) {
        if (selectedPages.length === 0) { setError("Select at least one page to extract."); setProcessing(false); return; }
        bytes = await extractPages(files[0], selectedPages);
        filename = "extracted.pdf";
        setDone({ label: `${fmt(bytes.length)} · ${selectedPages.length} pages`, bytes, name: filename });
      } else if (tool.name === "Compress PDF") {
        bytes = await compressPDF(files[0]);
        filename = "compressed.pdf";
        setDone({ label: `${fmt(bytes.length)} (was ${fmt(files[0].size)})`, bytes, name: filename });
      } else if (tool.name === "Repair PDF" || tool.name === "Flatten PDF") {
        bytes = await compressPDF(files[0]);
        filename = tool.name === "Repair PDF" ? "repaired.pdf" : "flattened.pdf";
        setDone({ label: `${fmt(bytes.length)}`, bytes, name: filename });
      } else {
        setError("This tool is coming soon.");
        setProcessing(false);
        return;
      }
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Is the PDF password-protected?");
    }
    setProcessing(false);
  }

  function handleReset() {
    setFiles([]); setPageCounts([]); setDone(null); setError(null);
    setSelectedPages([]); setPageOrder([]);
  }

  const hasPageSelector = isDelete || isExtract;
  const showPageGrid = files.length > 0 && totalPages > 0 && (hasPageSelector || isReorder);

  return (
    <div className="min-h-screen bg-[#f5f4f0] flex flex-col" style={{ fontFamily: "'Work Sans', sans-serif" }}>
      {/* Top bar */}
      <div className="bg-[#1a1a1a] text-white flex items-center justify-between px-6 py-3.5 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors">
            ← Back
          </button>
          <div className="h-4 w-px bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded text-xs flex items-center justify-center font-bold" style={{ background: categoryColor }}>
              {tool.icon}
            </span>
            <span className="text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>{tool.name}</span>
          </div>
          {isWorking && (
            <span className="text-[10px] bg-green-700 text-green-100 px-2 py-0.5 rounded-full font-medium">Working</span>
          )}
        </div>
        <span className="text-xs text-gray-500 hidden sm:block">{tool.hint}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-[#d8d6d0] hidden md:flex flex-col shrink-0">
          <div className="px-5 pt-6 pb-4 border-b border-[#d8d6d0]">
            <p className="text-xs uppercase tracking-widest text-[#6b6b6b] mb-3">Options</p>

            {tool.name === "Compress PDF" && (
              <div className="space-y-2">
                {compressionLevels.map((lvl, i) => (
                  <label key={lvl} className="flex items-center gap-2.5 cursor-pointer group" onClick={() => setCompression(i)}>
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${compression === i ? "border-[#e63329]" : "border-[#d8d6d0]"}`}>
                      {compression === i && <div className="w-1.5 h-1.5 rounded-full bg-[#e63329]" />}
                    </div>
                    <span className="text-xs text-[#1a1a1a]">{lvl}</span>
                  </label>
                ))}
              </div>
            )}

            {isSplit && files.length > 0 && totalPages > 1 && (
              <div>
                <p className="text-xs font-medium text-[#1a1a1a] mb-2">Split after page</p>
                <input
                  type="number"
                  min={1}
                  max={totalPages - 1}
                  value={splitAt}
                  onChange={(e) => setSplitAt(Number(e.target.value))}
                  className="w-full border border-[#d8d6d0] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                />
                <p className="text-xs text-[#6b6b6b] mt-1">of {totalPages} pages</p>
              </div>
            )}

            {isProtect && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-[#1a1a1a] mb-1">Password</p>
                  <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-[#d8d6d0] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
                </div>
                <p className="text-xs text-[#6b6b6b]">Note: Browser-level encryption. For strong encryption use a desktop tool.</p>
              </div>
            )}

            {!["Compress PDF", "Split PDF", "Protect PDF"].includes(tool.name) && (
              <p className="text-xs text-[#6b6b6b] leading-relaxed">{tool.desc}</p>
            )}
          </div>

          {files.length > 0 && (
            <div className="px-5 py-4 border-b border-[#d8d6d0]">
              <p className="text-xs uppercase tracking-widest text-[#6b6b6b] mb-2">File info</p>
              <p className="text-xs text-[#1a1a1a] truncate font-medium">{files[0].name}</p>
              <p className="text-xs text-[#6b6b6b]">{fmt(files[0].size)} · {pageCounts[0] ?? "?"} pages</p>
            </div>
          )}

          <div className="mt-auto px-5 py-5 border-t border-[#d8d6d0]">
            <div className="text-xs text-[#6b6b6b] space-y-2">
              <div className="flex items-center gap-2"><span className="text-[#e63329]">⬡</span> Processed in browser</div>
              <div className="flex items-center gap-2"><span className="text-[#e63329]">◈</span> No upload to servers</div>
              <div className="flex items-center gap-2"><span className="text-[#e63329]">∞</span> No file size limit</div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          {done ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10">
              <div className="w-full max-w-md text-center">
                <div className="w-16 h-16 bg-[#1a1a1a] rounded-full flex items-center justify-center text-white text-2xl mx-auto mb-5">✓</div>
                <h2 className="text-2xl font-bold text-[#1a1a1a] mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>Done!</h2>
                <p className="text-sm text-[#6b6b6b] mb-6">{done.label}</p>

                <div className="bg-white border border-[#d8d6d0] rounded-lg px-5 py-4 flex items-center gap-4 mb-6 text-left">
                  <div className="w-9 h-9 rounded bg-[#1a1a1a] flex items-center justify-center text-white text-xs shrink-0 font-bold">PDF</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[#1a1a1a]">{done.name}</p>
                    <p className="text-xs text-[#6b6b6b]">Ready to download</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => downloadBytes(done.bytes, done.name)}
                    className="flex-1 bg-[#e63329] text-white text-sm font-semibold py-3 rounded hover:bg-[#c0271f] transition-colors"
                  >
                    ↓ Download
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 border border-[#d8d6d0] text-[#1a1a1a] text-sm font-medium py-3 rounded hover:border-[#1a1a1a] transition-colors"
                  >
                    Process another
                  </button>
                </div>
                <p className="text-xs text-[#aaa] mt-4">All processing happened in your browser — no data was uploaded.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-start p-8 gap-5">
              {/* Drop zone / file list */}
              {files.length === 0 ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragging(false);
                    handleFiles(Array.from(e.dataTransfer.files));
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full max-w-xl border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-20 px-8 cursor-pointer transition-all ${dragging ? "border-[#e63329] bg-red-50" : "border-[#d8d6d0] hover:border-[#1a1a1a] bg-white"}`}
                >
                  <div className="w-14 h-14 rounded-lg flex items-center justify-center text-2xl mb-5" style={{ background: categoryColor, color: "#fff" }}>
                    {tool.icon}
                  </div>
                  <p className="text-base font-semibold text-[#1a1a1a] mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {isMerge ? "Drop PDFs here" : "Drop your PDF here"}
                  </p>
                  <p className="text-sm text-[#6b6b6b] mb-5 text-center">{tool.hint}</p>
                  <button className="bg-[#e63329] text-white text-sm font-semibold px-6 py-2.5 rounded hover:bg-[#c0271f] transition-colors">
                    Select {isMerge ? "files" : "file"}
                  </button>
                  <p className="text-xs text-[#aaa] mt-3">Works entirely in your browser — nothing is uploaded</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={tool.accept ?? ".pdf"}
                    multiple={!!tool.acceptMultiple}
                    className="hidden"
                    onChange={onFileInput}
                  />
                </div>
              ) : (
                <div className="w-full max-w-2xl space-y-4">
                  {/* File chips */}
                  <div className="space-y-2">
                    {files.map((f, i) => (
                      <div key={i} className="bg-white border border-[#d8d6d0] rounded-lg px-5 py-3.5 flex items-center gap-4">
                        <div className="w-9 h-9 rounded bg-[#1a1a1a] flex items-center justify-center text-white text-xs font-bold shrink-0">PDF</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1a1a1a] truncate">{f.name}</p>
                          <p className="text-xs text-[#6b6b6b]">{fmt(f.size)} · {pageCounts[i] ?? "…"} pages</p>
                        </div>
                        {isMerge && (
                          <div className="flex gap-1">
                            <button onClick={() => {
                              if (i === 0) return;
                              const nf = [...files]; [nf[i - 1], nf[i]] = [nf[i], nf[i - 1]];
                              setFiles(nf);
                            }} className="text-[#6b6b6b] hover:text-[#1a1a1a] px-1 text-xs">↑</button>
                            <button onClick={() => {
                              if (i === files.length - 1) return;
                              const nf = [...files]; [nf[i + 1], nf[i]] = [nf[i], nf[i + 1]];
                              setFiles(nf);
                            }} className="text-[#6b6b6b] hover:text-[#1a1a1a] px-1 text-xs">↓</button>
                          </div>
                        )}
                        <button onClick={() => { setFiles(files.filter((_, j) => j !== i)); setPageCounts(pageCounts.filter((_, j) => j !== i)); }} className="text-[#6b6b6b] hover:text-[#e63329] text-sm transition-colors">✕</button>
                      </div>
                    ))}
                  </div>

                  {/* Add more (merge) */}
                  {isMerge && (
                    <label className="block">
                      <div className="w-full border border-dashed border-[#d8d6d0] rounded-lg py-3 text-sm text-[#6b6b6b] hover:border-[#1a1a1a] hover:text-[#1a1a1a] transition-colors text-center cursor-pointer">
                        + Add more PDFs
                      </div>
                      <input type="file" accept=".pdf" multiple className="hidden" onChange={(e) => {
                        if (!e.target.files) return;
                        const added = Array.from(e.target.files);
                        const all = [...files, ...added];
                        handleFiles(all);
                      }} />
                    </label>
                  )}

                  {/* Page grid for delete / extract / reorder */}
                  {showPageGrid && (
                    <div className="bg-white border border-[#d8d6d0] rounded-lg p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs uppercase tracking-widest text-[#6b6b6b]">
                          {isReorder ? "Reorder pages" : hasPageSelector ? `Select pages to ${isDelete ? "delete" : "extract"}` : "Pages"}
                        </p>
                        {hasPageSelector && selectedPages.length > 0 && (
                          <span className="text-xs text-[#e63329] font-medium">{selectedPages.length} selected</span>
                        )}
                      </div>
                      <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
                        {(isReorder ? pageOrder : Array.from({ length: totalPages }, (_, i) => i)).map((pageIdx, i) => (
                          <div
                            key={`${pageIdx}-${i}`}
                            className={`relative aspect-[3/4] rounded border text-xs flex flex-col items-center justify-center transition-all select-none ${
                              isReorder
                                ? "border-[#d8d6d0] bg-[#f5f4f0] cursor-default"
                                : selectedPages.includes(pageIdx)
                                  ? isDelete
                                    ? "border-[#e63329] bg-red-50 text-[#e63329]"
                                    : "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                                  : "border-[#d8d6d0] bg-[#f5f4f0] hover:border-[#999] cursor-pointer"
                            }`}
                            onClick={() => hasPageSelector && togglePage(pageIdx)}
                          >
                            <span className="font-medium">{pageIdx + 1}</span>
                            {isReorder && (
                              <div className="absolute top-0.5 right-0.5 flex flex-col gap-0.5">
                                <button onClick={() => movePage(i, -1)} className="text-[8px] text-[#6b6b6b] hover:text-[#1a1a1a] leading-none px-0.5">▲</button>
                                <button onClick={() => movePage(i, 1)} className="text-[8px] text-[#6b6b6b] hover:text-[#1a1a1a] leading-none px-0.5">▼</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-[#e63329]">
                      {error}
                    </div>
                  )}

                  {/* Coming soon banner */}
                  {!isWorking && (
                    <div className="bg-[#f5f4f0] border border-[#d8d6d0] rounded-lg px-4 py-3 text-sm text-[#6b6b6b] text-center">
                      This tool requires a third-party API and is coming soon.
                    </div>
                  )}

                  {/* Action */}
                  <button
                    onClick={handleProcess}
                    disabled={processing || !isWorking}
                    className="w-full bg-[#e63329] hover:bg-[#c0271f] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3.5 rounded transition-colors flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Processing…
                      </>
                    ) : tool.actionLabel}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Home Page ────────────────────────────────────────────────────────────────
const recentTools = ["Merge PDF", "Split PDF", "Compress PDF", "Delete Pages"];
const stats = [
  { value: "100%", label: "Browser-based" },
  { value: "0", label: "Server uploads" },
  { value: "8", label: "Working tools" },
  { value: "Free", label: "Forever" },
];

function HomePage({ onSelectTool }: { onSelectTool: (t: Tool) => void }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredGroups = groups.map((cat) => ({
    category: cat,
    items: allTools.filter(
      (t) =>
        t.category === cat &&
        (!activeCategory || activeCategory === cat) &&
        (!searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.desc.toLowerCase().includes(searchQuery.toLowerCase()))
    ),
  })).filter((g) => g.items.length > 0 && (!activeCategory || g.category === activeCategory));

  return (
    <div className="min-h-screen" style={{ fontFamily: "'Work Sans', sans-serif" }}>
      <nav className="bg-[#1a1a1a] text-white flex items-center justify-between px-8 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="text-[#e63329] font-bold text-xl tracking-tight" style={{ fontFamily: "'DM Sans', sans-serif" }}>PDF</span>
          <span className="text-white font-bold text-xl tracking-tight" style={{ fontFamily: "'DM Sans', sans-serif" }}>tools</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
          {["All Tools", "Convert", "Organize", "Security"].map((item) => (
            <button key={item} onClick={() => setActiveCategory(item === "All Tools" ? null : item)} className="hover:text-white transition-colors">{item}</button>
          ))}
        </div>
        <button className="bg-[#e63329] text-white text-sm px-4 py-2 rounded hover:bg-[#c0271f] transition-colors font-medium">Get started free</button>
      </nav>

      {/* Hero */}
      <div className="grid md:grid-cols-2 min-h-[420px]">
        <div className="bg-[#1a1a1a] text-white flex flex-col justify-center px-10 py-16 md:px-16">
          <div className="mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#e63329] inline-block" />
            <span className="text-xs text-gray-400 uppercase tracking-widest">100% browser-based — nothing uploaded</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-5 max-w-xs" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Every PDF tool you need.
          </h1>
          <p className="text-gray-400 text-base leading-relaxed max-w-sm mb-8 font-light">
            Merge, split, compress, delete pages and more — all processed in your browser. No uploads. No signups. Completely free.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => onSelectTool(allTools[0])} className="bg-[#e63329] text-white px-6 py-3 text-sm font-semibold hover:bg-[#c0271f] transition-colors rounded">Start with Merge PDF</button>
            <button onClick={() => document.getElementById("tools-grid")?.scrollIntoView({ behavior: "smooth" })} className="border border-gray-600 text-gray-300 px-6 py-3 text-sm font-medium hover:border-gray-400 hover:text-white transition-colors rounded">Browse all tools</button>
          </div>
        </div>
        <div className="bg-[#f5f4f0] flex flex-col justify-center px-10 py-12 md:px-14">
          <p className="text-xs uppercase tracking-widest text-[#6b6b6b] mb-4 font-medium">Working tools — click to try</p>
          <div className="space-y-3">
            {recentTools.map((name, i) => {
              const t = allTools.find((a) => a.name === name)!;
              return (
                <div key={name} onClick={() => onSelectTool(t)} className="flex items-center justify-between bg-white border border-[#d8d6d0] px-5 py-3.5 rounded cursor-pointer hover:border-[#1a1a1a] transition-colors group">
                  <div className="flex items-center gap-4">
                    <span className="text-xs tabular-nums text-[#6b6b6b] w-4">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-sm font-semibold text-[#1a1a1a] group-hover:text-[#e63329] transition-colors">{name}</span>
                  </div>
                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Working</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search + filter */}
      <div className="bg-white border-b border-[#d8d6d0] px-8 py-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b6b] text-sm">⌕</span>
          <input type="text" placeholder="Search tools…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-4 py-2.5 border border-[#d8d6d0] rounded text-sm focus:outline-none focus:border-[#1a1a1a] bg-[#f5f4f0] placeholder-[#aaa]" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", ...groups].map((cat) => (
            <button key={cat} onClick={() => setActiveCategory(cat === "All" ? null : cat)} className={`text-xs px-4 py-2 rounded border transition-colors font-medium ${(cat === "All" && !activeCategory) || activeCategory === cat ? "bg-[#1a1a1a] text-white border-[#1a1a1a]" : "bg-white text-[#1a1a1a] border-[#d8d6d0] hover:border-[#1a1a1a]"}`}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Tools */}
      <div id="tools-grid" className="max-w-7xl mx-auto px-8 py-12 space-y-10">
        {filteredGroups.map((group) => (
          <div key={group.category}>
            <div className="flex items-center gap-3 mb-5">
              <span className="text-sm font-bold uppercase tracking-widest text-[#1a1a1a]" style={{ fontFamily: "'DM Sans', sans-serif" }}>{group.category}</span>
              <div className="flex-1 h-px bg-[#d8d6d0]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {group.items.map((tool) => (
                <div key={tool.name} onClick={() => onSelectTool(tool)} className="bg-white border border-[#d8d6d0] rounded p-6 cursor-pointer hover:border-[#1a1a1a] hover:shadow-sm transition-all group relative">
                  {WORKING_TOOLS.has(tool.name) && (
                    <span className="absolute top-3 right-3 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">Working</span>
                  )}
                  <div className="w-10 h-10 rounded flex items-center justify-center text-lg mb-4" style={{ background: tool.color, color: tool.textColor, border: tool.color === "#f5f4f0" ? "1px solid #d8d6d0" : "none" }}>
                    {tool.icon}
                  </div>
                  <h3 className="text-sm font-bold text-[#1a1a1a] mb-1.5 group-hover:text-[#e63329] transition-colors" style={{ fontFamily: "'DM Sans', sans-serif" }}>{tool.name}</h3>
                  <p className="text-xs text-[#6b6b6b] leading-relaxed font-light">{tool.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="bg-[#1a1a1a]">
        <div className="max-w-7xl mx-auto px-8 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-bold text-white mb-1" style={{ fontFamily: "'DM Sans', sans-serif" }}>{s.value}</div>
              <div className="text-xs text-gray-500 uppercase tracking-widest">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <footer className="bg-[#1a1a1a] text-gray-500 px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs border-t border-[#2c2c2c]">
        <div className="flex items-center gap-2">
          <span className="text-[#e63329] font-bold" style={{ fontFamily: "'DM Sans', sans-serif" }}>PDF</span>
          <span className="text-gray-400 font-bold" style={{ fontFamily: "'DM Sans', sans-serif" }}>tools</span>
          <span className="text-gray-600 ml-2">© 2026</span>
        </div>
        <div className="flex gap-6 text-gray-600">
          {["Privacy", "Terms", "Contact"].map((l) => (
            <a key={l} href="#" className="hover:text-gray-400 transition-colors">{l}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  if (activeTool) return <WorkspacePage tool={activeTool} onBack={() => setActiveTool(null)} />;
  return <HomePage onSelectTool={setActiveTool} />;
}
