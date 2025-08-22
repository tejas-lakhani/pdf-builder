import "./App.css";
import { useRef, useState, useEffect } from "react";
import Drop from "./Drop";
import { Document, Page, pdfjs } from "react-pdf";
import { PDFDocument, rgb } from "pdf-lib";
import { blobToURL } from "./utils/Utils";
import {
  savePdfForTemplate,
  getPdfForTemplate,
  deletePdfForTemplate,
} from "./utils/db";
import PagingControl from "./components/PagingControl";
import { AddSigDialog } from "./components/AddSigDialog";
import { Header } from "./Header";
import { BigButton } from "./components/BigButton";
import { Modal } from "./components/Modal";
import DraggableSignature from "./components/DraggableSignature";
import DraggableText from "./components/DraggableText";
import DraggableBox from "./components/DraggableBox";
import Sidebar from "./components/Sidebar";
import FieldPanel from "./components/FieldPanel";
import { primary45, errorColor } from "./utils/colors";
import dayjs from "dayjs";

// jdbnvcjdfbhjuvhdfju

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

function downloadURI(uri, name) {
  var link = document.createElement("a");
  link.download = name;
  link.href = uri;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Ensure image data is PNG or JPEG; convert other formats (e.g., WEBP, HEIC) to PNG
async function ensurePngOrJpegDataUrl(dataUrl) {
  const head = dataUrl.slice(0, 30).toLowerCase();
  const isPng = head.startsWith("data:image/png");
  const isJpeg =
    head.startsWith("data:image/jpeg") || head.startsWith("data:image/jpg");
  if (isPng || isJpeg) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        const pngUrl = canvas.toDataURL("image/png");
        resolve(pngUrl);
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function detectImageTypeFromBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (
    u8.length >= 8 &&
    u8[0] === 0x89 &&
    u8[1] === 0x50 &&
    u8[2] === 0x4e &&
    u8[3] === 0x47 &&
    u8[4] === 0x0d &&
    u8[5] === 0x0a &&
    u8[6] === 0x1a &&
    u8[7] === 0x0a
  ) {
    return "png";
  }
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
    return "jpeg";
  }
  return null;
}

async function convertAnyImageToPngBytes(srcUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        const pngUrl = canvas.toDataURL("image/png");
        const bytes = await fetch(pngUrl).then((r) => r.arrayBuffer());
        resolve(new Uint8Array(bytes));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = srcUrl;
  });
}

function App() {
  const styles = {
    container: {
      position: "relative",
      maxWidth: 900,
      margin: "0 auto",
    },
    sigBlock: {
      display: "inline-block",
      border: "1px solid #000",
    },
    documentBlock: {
      maxWidth: 800,
      margin: "20px auto",
      marginTop: 8,
      border: "1px solid #999",
    },
    controls: {
      maxWidth: 800,
      margin: "0 auto",
      marginTop: 8,
    },
  };

  const [pdf, setPdf] = useState(null);
  const [autoDate, setAutoDate] = useState(true);
  const [signatureURL, setSignatureURL] = useState(null);
  const [position, setPosition] = useState(null);
  const [signatureDialogVisible, setSignatureDialogVisible] = useState(false);
  const [textInputVisible, setTextInputVisible] = useState(false);
  const [pageNum, setPageNum] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [pageDetails, setPageDetails] = useState(null);
  const documentRef = useRef(null);
  const [photoURL, setPhotoURL] = useState(null);
  const [mode, setMode] = useState("view"); // 'view' | 'build' | 'fill'
  const [pendingField, setPendingField] = useState(null); // { type, width, height } | null
  const [fields, setFields] = useState([]); // [{id,type,page,xNorm,yNorm,wNorm,hNorm}]
  const [valuesByFieldId, setValuesByFieldId] = useState({});
  const [sigFieldId, setSigFieldId] = useState(null);
  const pdfContainerRef = useRef(null);
  const [resizing, setResizing] = useState(null); // { id, startX, startY, startW, startH }
  const [dragging, setDragging] = useState(null); // { id, startX, startY, startLeft, startTop }
  const [fillModalOpen, setFillModalOpen] = useState(false);
  const [fillIndex, setFillIndex] = useState(0);
  const [templates, setTemplates] = useState([]); // { id, name, fields, pdfUrl, createdAt }
  const [templateListVisible, setTemplateListVisible] = useState(false);
  const [shareTemplateId, setShareTemplateId] = useState(null);
  const [recipientMode, setRecipientMode] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");

  // Load templates from localStorage on component mount
  useEffect(() => {
    const savedTemplates = localStorage.getItem("pdf-editor-templates");
    if (savedTemplates) {
      try {
        const parsed = JSON.parse(savedTemplates);

        // Migration: move any inline pdfUrl into IndexedDB and strip from templates
        (async () => {
          const migrated = await Promise.all(
            parsed.map(async (t) => {
              if (t && t.pdfUrl && typeof t.pdfUrl === "string") {
                try {
                  await savePdfForTemplate(t.id, t.pdfUrl);
                } catch (e) {
                  console.warn("Failed to migrate PDF to IndexedDB", e);
                }
                const { pdfUrl, ...rest } = t;
                return rest;
              }
              return t;
            })
          );
          setTemplates(migrated);
        })();
      } catch (e) {
        console.error("Failed to parse templates from localStorage", e);
      }
    }

    // Check for shared template in URL
    const urlParams = new URLSearchParams(window.location.search);
    // Preferred short form: only fields are shared (no PDF in URL)
    const shortParam = urlParams.get("t");
    if (shortParam) {
      try {
        const data = JSON.parse(decodeURIComponent(shortParam));
        if (!data || !Array.isArray(data.f)) {
          throw new Error("Missing fields");
        }

        setFields(data.f);
        setRecipientMode(Boolean(data.r));

        // If a template id is present, try to load PDF from local IndexedDB (works on same device)
        if (data.i) {
          (async () => {
            try {
              const storedPdf = await getPdfForTemplate(data.i);
              if (storedPdf) {
                setPdf(storedPdf);
                setMode("fill");
                return;
              }
            } catch (e) {
              console.warn(
                "Failed to retrieve local PDF for shared template id:",
                e
              );
            }
          })();
        }

        // If a remote PDF URL is provided, try to fetch and load it automatically
        if (data.p && /^https?:\/\//i.test(data.p)) {
          (async () => {
            try {
              const res = await fetch(data.p, { mode: "cors" });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const blob = await res.blob();
              const dataUrl = await blobToURL(blob);
              setPdf(dataUrl);
              setMode("fill");
            } catch (e) {
              console.warn("Failed to auto-load remote PDF from share:", e);
              if (!Boolean(data.r)) setMode("build");
            }
          })();
        } else if (!data.i) {
          if (!Boolean(data.r)) setMode("build");
        }

        return; // Do not process legacy param if short form is present
      } catch (err) {
        console.error("Invalid short template URL:", err);
        alert("Invalid or corrupted template link. Please check the URL.");
      }
    }

    const templateParam = urlParams.get("template");
    if (templateParam) {
      try {
        const sharedTemplate = JSON.parse(atob(templateParam));

        // Validate required properties
        if (!sharedTemplate.fields || !sharedTemplate.pdfUrl) {
          throw new Error("Missing required template data");
        }

        console.log("Loading shared template:", sharedTemplate);

        // Check if PDF URL is valid
        if (!sharedTemplate.pdfUrl.startsWith("data:application/pdf")) {
          throw new Error("Invalid PDF data in template");
        }

        setFields(sharedTemplate.fields);
        setPdf(sharedTemplate.pdfUrl);
        setMode("fill");

        const templateName = sharedTemplate.name || "Shared Template";
        alert(`Loading shared template: "${templateName}"`);
      } catch (error) {
        console.error("Invalid template URL:", error);
        alert(
          "Invalid or corrupted template link. Please check the URL and try again."
        );
      }
    }
  }, []);

  // Save templates to localStorage whenever templates change
  useEffect(() => {
    try {
      localStorage.setItem("pdf-editor-templates", JSON.stringify(templates));
    } catch (e) {
      console.warn("Failed to save templates to localStorage:", e);
      // Try minimal recovery by trimming oldest one and retry once
      if (templates && templates.length > 0) {
        const trimmed = templates.slice(1);
        try {
          localStorage.setItem("pdf-editor-templates", JSON.stringify(trimmed));
          setTemplates(trimmed);
          alert(
            "Storage is full. The oldest template was removed to save space."
          );
        } catch (err) {
          console.warn("Retry after trimming failed:", err);
          alert(
            "Storage quota exceeded. Please delete some templates or disable Private Browsing and try again."
          );
        }
      } else {
        alert(
          "Storage quota exceeded. Please clear some browser storage and try again."
        );
      }
    }
  }, [templates]);

  // Function to save current form as template
  const saveTemplate = (templateName) => {
    if (!templateName.trim()) {
      alert("Please enter a template name");
      return;
    }

    if (fields.length === 0) {
      alert("No fields to save. Please add some fields first.");
      return;
    }

    const newTemplate = {
      id: Date.now().toString(),
      name: templateName.trim(),
      fields: [...fields],
      createdAt: new Date().toISOString(),
    };

    // Store PDF separately in IndexedDB to avoid localStorage quota
    if (pdf && typeof pdf === "string") {
      savePdfForTemplate(newTemplate.id, pdf).catch((e) => {
        console.warn("Failed to store PDF in IndexedDB:", e);
      });
    }

    setTemplates((prev) => [...prev, newTemplate]);
    alert(`Template "${templateName}" saved successfully!`);
  };

  // Function to load template
  const loadTemplate = async (template) => {
    setFields(template.fields);
    try {
      const storedPdf = await getPdfForTemplate(template.id);
      if (storedPdf) {
        setPdf(storedPdf);
      } else {
        setPdf(null);
        alert("This template has no PDF stored. Please upload the PDF.");
      }
    } catch (e) {
      console.warn("Failed to load PDF from IndexedDB:", e);
      setPdf(null);
      alert(
        "Failed to load the PDF for this template. Please upload it again."
      );
    }
    setMode("build");
    setTemplateListVisible(false);
  };

  // Function to delete template
  const deleteTemplate = (templateId) => {
    if (window.confirm("Are you sure you want to delete this template?")) {
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      deletePdfForTemplate(templateId).catch((e) =>
        console.warn("Failed to delete PDF from IndexedDB:", e)
      );
    }
  };

  // Function to generate shareable link (short): share only fields, not the PDF
  const generateShareableLink = (
    templateId,
    { recipientOnly = false } = {}
  ) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return "";

    // Short payload: { v, n, f } where
    // v: version, n: name, f: fields
    const shortData = {
      v: 1,
      n: template.name,
      f: template.fields,
      i: template.id,
    };
    if (recipientOnly) shortData.r = 1;
    const encoded = encodeURIComponent(JSON.stringify(shortData));
    const shareUrl = `${window.location.origin}${window.location.pathname}?t=${encoded}`;

    return shareUrl;
  };

  useEffect(() => {
    if (!resizing) return;
    function onMove(e) {
      if (!documentRef.current) return;
      const domW = documentRef.current.clientWidth;
      const domH = documentRef.current.clientHeight;
      if (!domW || !domH) return;
      const deltaX = e.clientX - resizing.startX;
      const deltaY = e.clientY - resizing.startY;
      const newW = Math.max(16, resizing.startW + deltaX);
      const newH = Math.max(16, resizing.startH + deltaY);
      setFields((prev) =>
        prev.map((f) =>
          f.id === resizing.id
            ? { ...f, wNorm: newW / domW, hNorm: newH / domH }
            : f
        )
      );
    }
    function onUp() {
      setResizing(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing]);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e) {
      if (!documentRef.current) return;
      const domW = documentRef.current.clientWidth;
      const domH = documentRef.current.clientHeight;
      if (!domW || !domH) return;
      const deltaX = e.clientX - dragging.startX;
      const deltaY = e.clientY - dragging.startY;
      setFields((prev) =>
        prev.map((f) => {
          if (f.id !== dragging.id) return f;
          const widthPx = f.wNorm * domW;
          const heightPx = f.hNorm * domH;
          let newLeft = dragging.startLeft + deltaX;
          let newTop = dragging.startTop + deltaY;
          newLeft = Math.max(0, Math.min(newLeft, domW - widthPx));
          newTop = Math.max(0, Math.min(newTop, domH - heightPx));
          const newXNorm = newLeft / domW;
          const newYNorm = (domH - newTop - heightPx) / domH;
          return { ...f, xNorm: newXNorm, yNorm: newYNorm };
        })
      );
    }
    function onUp() {
      setDragging(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  function makeId(prefix = "fld") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function exportTemplate() {
    const data = { version: 1, fields };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    downloadURI(URL.createObjectURL(blob), "template.json");
  }

  function importTemplate(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data.fields)) {
          setFields(data.fields);
        }
      } catch (err) {
        console.error("Invalid template:", err);
      }
    };
    reader.readAsText(file);
  }

  function clearFields() {
    setFields([]);
    setValuesByFieldId({});
  }

  function placePendingField() {
    if (!pendingField || !pageDetails || !documentRef.current || !position)
      return;

    const pageEl = documentRef.current.querySelector(".react-pdf__Page");
    if (!pageEl) return;
    const domW = pageEl.clientWidth;
    const domH = pageEl.clientHeight;

    const field = {
      id: makeId(),
      type: pendingField.type,
      page: pageNum,
      wNorm: (pendingField.width ?? 200) / domW,
      hNorm: (pendingField.height ?? 64) / domH,
      xNorm: position.x / domW,
      yNorm: (domH - position.y - (pendingField.height ?? 64)) / domH,
      required: false,
    };

    setFields((prev) => [...prev, field]);
    setPendingField(null);
  }

  async function flattenAndDownload() {
    if (!pdf) return;
    // Validate required fields before flattening
    const missing = fields.filter((f) => {
      if (f.page !== pageNum && mode !== "fill") return false;
      const val = valuesByFieldId[f.id];
      switch (f.type) {
        case "text":
          return f.required && !(typeof val === "string" && val.trim().length);
        case "date":
          return (
            f.required &&
            !(
              (typeof val === "string" && val.length) ||
              dayjs().format("YYYY-MM-DD").length
            )
          );
        case "signature":
          return f.required && !val;
        case "photo":
          return f.required && !val;
        case "checkbox":
          return f.required && !val;
        default:
          return false;
      }
    });
    if (missing.length) {
      alert("Please complete all required fields before downloading.");
      return;
    }

    const pdfDoc = await PDFDocument.load(pdf);
    const pages = pdfDoc.getPages();

    fields.forEach((f) => {
      const page = pages[f.page];
      if (!page) return;
      const { width: pw, height: ph } = page.getSize();
      const x = f.xNorm * pw;
      const y = f.yNorm * ph;
      const w = f.wNorm * pw;
      const h = f.hNorm * ph;
      const value = valuesByFieldId[f.id];

      switch (f.type) {
        case "text": {
          const text = typeof value === "string" ? value : "";
          page.drawText(text, { x, y, size: 14 });
          break;
        }
        case "date": {
          const text =
            typeof value === "string" && value
              ? value
              : dayjs().format("YYYY-MM-DD");
          page.drawText(text, { x, y, size: 14 });
          break;
        }
        case "signature": {
          if (!value) break;
          // value is dataURL png
          // embedPng supports Uint8Array or dataUrl directly
          // Convert dataURL to arrayBuffer for compatibility
          // eslint-disable-next-line no-unused-vars
          const _ = 0;
          // Using fetch on dataURL to get ArrayBuffer
          // Some environments support passing dataURL directly, this is safer
          // but consistent with photo flow
          // We'll use embedPng on bytes
          // NOTE: keep aspect ratio by fitting into box height
          // and width
          // For simplicity, scale to box size
          // eslint-disable-next-line no-undef
          break;
        }
        case "photo": {
          // handled below together with signature to share logic
          break;
        }
        case "checkbox": {
          const checked = !!value;
          const box = 14;
          page.drawRectangle({
            x,
            y,
            width: Math.min(box, w),
            height: Math.min(box, h),
            borderWidth: 1,
          });
          if (checked) {
            page.drawText("X", { x: x + 2, y: y + 2, size: 12 });
          }
          break;
        }
        default:
          break;
      }
    });

    // Second pass for images to keep code simpler (embedding is async)
    for (const f of fields) {
      if (f.type !== "signature" && f.type !== "photo") continue;
      const val = valuesByFieldId[f.id];
      if (!val) continue;
      const page = pdfDoc.getPage(f.page);
      const { width: pw, height: ph } = page.getSize();
      const x = f.xNorm * pw;
      const y = f.yNorm * ph;
      const w = f.wNorm * pw;
      const h = f.hNorm * ph;
      // Robust image detection + fallback conversion
      const bytesBuf = await fetch(val).then((r) => r.arrayBuffer());
      let u8 = new Uint8Array(bytesBuf);
      let detected = detectImageTypeFromBytes(u8);
      let img;
      try {
        if (detected === "png") {
          img = await pdfDoc.embedPng(u8);
        } else if (detected === "jpeg") {
          img = await pdfDoc.embedJpg(u8);
        } else {
          try {
            img = await pdfDoc.embedPng(u8);
          } catch (_) {
            img = await pdfDoc.embedJpg(u8);
          }
        }
      } catch (e) {
        try {
          const pngBytes = await convertAnyImageToPngBytes(val);
          img = await pdfDoc.embedPng(pngBytes);
        } catch (e2) {
          continue;
        }
      }
      // Scale to fit box
      const imgDims = img.scale(1);
      const scaleX = w / imgDims.width;
      const scaleY = h / imgDims.height;
      const scale = Math.min(scaleX, scaleY);
      const drawW = imgDims.width * scale;
      const drawH = imgDims.height * scale;
      page.drawImage(img, { x, y, width: drawW, height: drawH });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([new Uint8Array(pdfBytes)]);
    const URL2 = await blobToURL(blob);
    downloadURI(URL2, "filled.pdf");
  }

  return (
    <div>
      <Header />
      <div ref={pdfContainerRef} style={styles.container} className="pdf_div">
        {signatureDialogVisible ? (
          <AddSigDialog
            autoDate={autoDate}
            setAutoDate={setAutoDate}
            onClose={() => setSignatureDialogVisible(false)}
            onConfirm={(url) => {
              setSignatureURL(url);
              setSignatureDialogVisible(false);
            }}
          />
        ) : null}

        {!pdf ? (
          <>
            <Drop
              onLoaded={async (files) => {
                const URL = await blobToURL(files[0]);
                setPdf(URL);
              }}
            />
            {!recipientMode && (
              <div style={{ textAlign: "center", margin: "20px 0" }}>
                <p style={{ color: "#666", marginBottom: 16 }}>
                  Or load an existing template:
                </p>
                <BigButton
                  title="My Templates"
                  onClick={() => setTemplateListVisible(true)}
                />
              </div>
            )}
          </>
        ) : null}
        {pdf ? (
          <>
            <div style={{ display: "flex" }}>
              <div
                ref={documentRef}
                style={styles.documentBlock}
                onDragOver={(e) => {
                  // Allow dropping field buttons onto the PDF area
                  if (mode !== "build") return;
                  if (!documentRef.current) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  if (mode !== "build") return;
                  if (!documentRef.current) return;
                  const data = e.dataTransfer.getData(
                    "application/x-pdf-field"
                  );
                  if (!data) return;
                  e.preventDefault();
                  try {
                    const meta = JSON.parse(data);
                    const pageEl =
                      documentRef.current.querySelector(".react-pdf__Page");
                    if (!pageEl) return;
                    const pageRect = pageEl.getBoundingClientRect();

                    // Mouse position relative to page top-left
                    const dropX = e.clientX - pageRect.left;
                    const dropY = e.clientY - pageRect.top;

                    const domW = pageEl.clientWidth;
                    const domH = pageEl.clientHeight;
                    if (!domW || !domH) return;

                    const fieldW = meta.width ?? 200;
                    const fieldH = meta.height ?? 64;

                    // Clamp top-left so field fits inside the page
                    const clampedLeft = Math.max(
                      0,
                      Math.min(dropX, domW - fieldW)
                    );
                    const clampedTop = Math.max(
                      0,
                      Math.min(dropY, domH - fieldH)
                    );

                    const newField = {
                      id: makeId(),
                      type: meta.type,
                      page: pageNum,
                      wNorm: fieldW / domW,
                      hNorm: fieldH / domH,
                      xNorm: clampedLeft / domW,
                      yNorm: (domH - clampedTop - fieldH) / domH,
                      required: false,
                    };

                    setFields((prev) => [...prev, newField]);
                  } catch (err) {
                    // ignore malformed payloads
                  }
                }}
              >
                {pendingField ? (
                  <DraggableBox
                    label={`Place ${pendingField.type}`}
                    width={pendingField.width ?? 200}
                    height={pendingField.height ?? 64}
                    onCancel={() => setPendingField(null)}
                    onDrag={(e, data) => {
                      // Log current position during drag for debugging
                      console.log("Dragging at position:", {
                        x: data.x,
                        y: data.y,
                      });

                      // Ensure element maintains proper styling during drag
                      data.node.style.opacity = "1";
                      data.node.style.borderColor = primary45;
                    }}
                    onEnd={(e, data) => {
                      const pageEl =
                        documentRef.current.querySelector(".react-pdf__Page");
                      if (!pageEl) return;
                      const pageRect = pageEl.getBoundingClientRect();

                      // Get draggable's own bounding box after drag ends
                      const boxRect = data.node.getBoundingClientRect();

                      setPosition({
                        x: boxRect.left - pageRect.left,
                        y: boxRect.top - pageRect.top,
                      });
                    }}
                    onSet={placePendingField}
                    bounds={{
                      left: 0,
                      top: 0,
                      right:
                        documentRef.current?.clientWidth -
                        (pendingField.width ?? 200),
                      bottom:
                        documentRef.current?.clientHeight -
                        (pendingField.height ?? 64),
                    }}
                  />
                ) : null}
                {textInputVisible ? (
                  <DraggableText
                    initialText={
                      textInputVisible === "date"
                        ? dayjs().format("M/d/YYYY")
                        : null
                    }
                    onCancel={() => setTextInputVisible(false)}
                    onEnd={setPosition}
                    bounds={pdfContainerRef.current}
                    onSet={async (text) => {
                      const { originalHeight, originalWidth } = pageDetails;
                      const scale =
                        originalWidth / documentRef.current.clientWidth;

                      const y =
                        documentRef.current.clientHeight -
                        (position.y +
                          12 * scale -
                          position.offsetY -
                          documentRef.current.offsetTop);
                      const x =
                        position.x -
                        166 -
                        position.offsetX -
                        documentRef.current.offsetLeft;

                      // new XY in relation to actual document size
                      const newY =
                        (y * originalHeight) / documentRef.current.clientHeight;
                      const newX =
                        (x * originalWidth) / documentRef.current.clientWidth;

                      const pdfDoc = await PDFDocument.load(pdf);

                      const pages = pdfDoc.getPages();
                      const firstPage = pages[pageNum];

                      firstPage.drawText(text, {
                        x: newX,
                        y: newY,
                        size: 20 * scale,
                      });

                      const pdfBytes = await pdfDoc.save();
                      const blob = new Blob([new Uint8Array(pdfBytes)]);

                      const URL = await blobToURL(blob);
                      setPdf(URL);
                      setPosition(null);
                      setTextInputVisible(false);
                    }}
                  />
                ) : null}
                {signatureURL ? (
                  <DraggableSignature
                    url={signatureURL}
                    onCancel={() => {
                      setSignatureURL(null);
                    }}
                    bounds={pdfContainerRef.current}
                    onSet={async () => {
                      const { originalHeight, originalWidth } = pageDetails;
                      const scale =
                        originalWidth / documentRef.current.clientWidth;

                      const y =
                        documentRef.current.clientHeight -
                        (position.y -
                          position.offsetY +
                          64 -
                          documentRef.current.offsetTop);
                      const x =
                        position.x -
                        160 -
                        position.offsetX -
                        documentRef.current.offsetLeft;

                      // new XY in relation to actual document size
                      const newY =
                        (y * originalHeight) / documentRef.current.clientHeight;
                      const newX =
                        (x * originalWidth) / documentRef.current.clientWidth;

                      const pdfDoc = await PDFDocument.load(pdf);

                      const pages = pdfDoc.getPages();
                      const firstPage = pages[pageNum];

                      const pngImage = await pdfDoc.embedPng(signatureURL);
                      const pngDims = pngImage.scale(scale * 0.3);

                      firstPage.drawImage(pngImage, {
                        x: newX,
                        y: newY,
                        width: pngDims.width,
                        height: pngDims.height,
                      });

                      if (autoDate) {
                        firstPage.drawText(
                          `Signed ${dayjs().format("M/d/YYYY HH:mm:ss ZZ")}`,
                          {
                            x: newX,
                            y: newY - 10,
                            size: 14 * scale,
                            color: rgb(0.074, 0.545, 0.262),
                          }
                        );
                      }

                      const pdfBytes = await pdfDoc.save();
                      const blob = new Blob([new Uint8Array(pdfBytes)]);

                      const URL = await blobToURL(blob);
                      setPdf(URL);
                      setPosition(null);
                      setSignatureURL(null);
                    }}
                    onEnd={setPosition}
                  />
                ) : null}

                {photoURL && (
                  <DraggableSignature
                    url={photoURL}
                    onCancel={() => setPhotoURL(null)}
                    bounds={pdfContainerRef.current}
                    onSet={async () => {
                      const { originalHeight, originalWidth } = pageDetails;
                      const scale =
                        originalWidth / documentRef.current.clientWidth;

                      const y =
                        documentRef.current.clientHeight -
                        (position.y -
                          position.offsetY +
                          64 -
                          documentRef.current.offsetTop);
                      const x =
                        position.x -
                        160 -
                        position.offsetX -
                        documentRef.current.offsetLeft;

                      const newY =
                        (y * originalHeight) / documentRef.current.clientHeight;
                      const newX =
                        (x * originalWidth) / documentRef.current.clientWidth;

                      const pdfDoc = await PDFDocument.load(pdf);
                      const pages = pdfDoc.getPages();
                      const page = pages[pageNum];

                      const imageBytes = await fetch(photoURL).then((res) =>
                        res.arrayBuffer()
                      );
                      const ext = photoURL.startsWith("data:image/png")
                        ? "png"
                        : "jpg";
                      const img =
                        ext === "png"
                          ? await pdfDoc.embedPng(imageBytes)
                          : await pdfDoc.embedJpg(imageBytes);

                      const dims = img.scale(scale * 0.3);

                      page.drawImage(img, {
                        x: newX,
                        y: newY,
                        width: dims.width,
                        height: dims.height,
                      });

                      const pdfBytes = await pdfDoc.save();
                      const blob = new Blob([new Uint8Array(pdfBytes)]);
                      const URL = await blobToURL(blob);

                      setPdf(URL);
                      setPosition(null);
                      setPhotoURL(null);
                    }}
                    onEnd={setPosition}
                  />
                )}

                {/* Build mode field outlines */}
                {mode !== "view" &&
                  fields
                    .filter((f) => f.page === pageNum)
                    .map((f) => {
                      if (!pageDetails || !documentRef.current) return null;
                      const domW = documentRef.current.clientWidth;
                      const domH = documentRef.current.clientHeight;
                      const left = f.xNorm * domW;
                      const top = domH - f.yNorm * domH - f.hNorm * domH;
                      const width = f.wNorm * domW;
                      const height = f.hNorm * domH;
                      const commonStyle = {
                        position: "absolute",
                        left,
                        top,
                        width,
                        height,
                        border:
                          mode === "build"
                            ? "2px dashed #2a6"
                            : "1px solid #2a6",
                        background:
                          mode === "build" ? "rgba(0,0,0,0.02)" : "transparent",
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: mode === "build" ? "auto" : "auto",
                        zIndex: 1000,
                      };
                      if (mode === "build") {
                        return (
                          <div
                            key={f.id}
                            style={{
                              ...commonStyle,
                              position: "absolute",
                              cursor: "move",
                            }}
                            title={`${f.type}`}
                            onMouseDown={(e) => {
                              if (!documentRef.current) return;
                              const domW = documentRef.current.clientWidth;
                              const domH = documentRef.current.clientHeight;
                              const startLeft = f.xNorm * domW;
                              const startTop =
                                domH - f.yNorm * domH - f.hNorm * domH;
                              setDragging({
                                id: f.id,
                                startX: e.clientX,
                                startY: e.clientY,
                                startLeft,
                                startTop,
                              });
                            }}
                            onDoubleClick={() => {
                              setFields((prev) =>
                                prev.filter((x) => x.id !== f.id)
                              );
                            }}
                          >
                            <span style={{ pointerEvents: "none" }}>
                              {f.type}
                            </span>
                            {/* Required toggle */}
                            <label
                              style={{
                                position: "absolute",
                                left: -2,
                                top: -22,
                                background: "#fff",
                                border: "1px solid #2a6",
                                padding: "2px 4px",
                                fontSize: 12,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={!!f.required}
                                onChange={(e) =>
                                  setFields((prev) =>
                                    prev.map((x) =>
                                      x.id === f.id
                                        ? { ...x, required: e.target.checked }
                                        : x
                                    )
                                  )
                                }
                                style={{ marginRight: 4 }}
                              />
                              req
                            </label>
                            {/* Remove button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFields((prev) =>
                                  prev.filter((x) => x.id !== f.id)
                                );
                              }}
                              style={{
                                position: "absolute",
                                top: -10,
                                right: -10,
                                width: 20,
                                height: 20,
                                borderRadius: "50%",
                                border: "1px solid #c33",
                                background: "#fff",
                                color: "#c33",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                lineHeight: 1,
                                padding: 0,
                              }}
                              title="Remove field"
                            >
                              ×
                            </button>
                            {/* Resize handle (bottom-right) */}
                            <div
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!documentRef.current) return;
                                const domW = documentRef.current.clientWidth;
                                const domH = documentRef.current.clientHeight;
                                const currentW = f.wNorm * domW;
                                const currentH = f.hNorm * domH;
                                setResizing({
                                  id: f.id,
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  startW: currentW,
                                  startH: currentH,
                                });
                              }}
                              style={{
                                position: "absolute",
                                right: -6,
                                bottom: -6,
                                width: 12,
                                height: 12,
                                background: "#2a6",
                                border: "2px solid #fff",
                                borderRadius: 2,
                                cursor: "nwse-resize",
                              }}
                              title="Resize"
                            />
                          </div>
                        );
                      }
                      // fill mode overlays
                      if (f.type === "text") {
                        return (
                          <input
                            key={f.id}
                            style={{
                              ...commonStyle,
                              border: "2px solid #2a6",
                              background: "#fff",
                              outline:
                                f.required && !valuesByFieldId[f.id]
                                  ? "2px solid #c33"
                                  : undefined,
                            }}
                            value={valuesByFieldId[f.id] || ""}
                            onChange={(e) =>
                              setValuesByFieldId((prev) => ({
                                ...prev,
                                [f.id]: e.target.value,
                              }))
                            }
                            placeholder="Enter text"
                            onClick={() => {
                              setFillIndex(
                                fields.findIndex((x) => x.id === f.id)
                              );
                              setFillModalOpen(true);
                            }}
                          />
                        );
                      }
                      if (f.type === "date") {
                        return (
                          <input
                            key={f.id}
                            type="date"
                            style={{
                              ...commonStyle,
                              border: "2px solid #2a6",
                              background: "#fff",
                              outline:
                                f.required &&
                                !(valuesByFieldId[f.id] || "").toString().length
                                  ? "2px solid #c33"
                                  : undefined,
                            }}
                            value={
                              valuesByFieldId[f.id] ||
                              dayjs().format("YYYY-MM-DD")
                            }
                            onChange={(e) =>
                              setValuesByFieldId((prev) => ({
                                ...prev,
                                [f.id]: e.target.value,
                              }))
                            }
                            placeholder="Select date"
                            onClick={() => {
                              setFillIndex(
                                fields.findIndex((x) => x.id === f.id)
                              );
                              setFillModalOpen(true);
                            }}
                          />
                        );
                      }
                      if (f.type === "signature") {
                        const val = valuesByFieldId[f.id];
                        return (
                          <span
                            key={f.id}
                            style={{
                              ...commonStyle,
                              border: "2px solid #2a6",
                              background: "#fff",
                              outline:
                                f.required && !val
                                  ? "2px solid #c33"
                                  : undefined,
                            }}
                            onClick={() => {
                              setFillIndex(
                                fields.findIndex((x) => x.id === f.id)
                              );
                              setFillModalOpen(true);
                            }}
                          >
                            {val ? (
                              <img
                                src={val}
                                alt="signature"
                                style={{ maxWidth: "100%", maxHeight: "100%" }}
                              />
                            ) : (
                              <BigButton
                                title="Sign"
                                onClick={() => setSigFieldId(f.id)}
                              />
                            )}
                          </span>
                        );
                      }
                      if (f.type === "photo") {
                        const val = valuesByFieldId[f.id];
                        return (
                          <div
                            key={f.id}
                            style={{
                              ...commonStyle,
                              border: "2px solid #2a6",
                              background: "#fff",
                              outline:
                                f.required && !val
                                  ? "2px solid #c33"
                                  : undefined,
                            }}
                            onClick={() => {
                              setFillIndex(
                                fields.findIndex((x) => x.id === f.id)
                              );
                              setFillModalOpen(true);
                            }}
                          >
                            {val ? (
                              <img
                                src={val}
                                alt="photo"
                                style={{ maxWidth: "100%", maxHeight: "100%" }}
                              />
                            ) : (
                              <label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: "none" }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = async (ev) => {
                                      const dataUrl = ev.target.result;
                                      const normalized =
                                        await ensurePngOrJpegDataUrl(dataUrl);
                                      setValuesByFieldId((prev) => ({
                                        ...prev,
                                        [f.id]: normalized,
                                      }));
                                    };
                                    reader.readAsDataURL(file);
                                  }}
                                />
                                <BigButton title="Upload" onClick={() => {}} />
                              </label>
                            )}
                          </div>
                        );
                      }
                      if (f.type === "checkbox") {
                        const checked = !!valuesByFieldId[f.id];
                        return (
                          <div
                            key={f.id}
                            style={{
                              ...commonStyle,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "#fff",
                              outline:
                                f.required && !checked
                                  ? "2px solid #c33"
                                  : undefined,
                            }}
                            onClick={() => {
                              setFillIndex(
                                fields.findIndex((x) => x.id === f.id)
                              );
                              setFillModalOpen(true);
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setValuesByFieldId((prev) => ({
                                  ...prev,
                                  [f.id]: e.target.checked,
                                }))
                              }
                              style={{
                                width: Math.min(20, width),
                                height: Math.min(20, height),
                              }}
                            />
                          </div>
                        );
                      }
                      return null;
                    })}

                <Document
                  file={pdf}
                  onLoadSuccess={(data) => {
                    setTotalPages(data.numPages);
                  }}
                >
                  <Page
                    pageNumber={pageNum + 1}
                    width={800}
                    height={1200}
                    onLoadSuccess={(data) => {
                      setPageDetails(data);
                    }}
                  />
                </Document>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "12px",
                  maxWidth: "600px",
                  height: "fit-content",
                  padding: "10px",
                }}
              >
                {!recipientMode && (
                  <BigButton
                    title={mode === "build" ? "Switch to View" : "Build Form"}
                    onClick={() =>
                      setMode((m) => (m === "build" ? "view" : "build"))
                    }
                  />
                )}
                <BigButton
                  title={mode === "fill" ? "Switch to View" : "Fill Form"}
                  onClick={() => {
                    setMode((m) => {
                      const next = m === "fill" ? "view" : "fill";
                      if (next === "fill") {
                        setFillIndex(0);
                        setFillModalOpen(true);
                      } else {
                        setFillModalOpen(false);
                      }
                      return next;
                    });
                  }}
                />

                {mode === "build" && !recipientMode && (
                  <>
                    <BigButton
                      title="Add Text Field"
                      onClick={() =>
                        setPendingField({
                          type: "text",
                          width: 200,
                          height: 40,
                        })
                      }
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/x-pdf-field",
                          JSON.stringify({
                            type: "text",
                            width: 200,
                            height: 40,
                          })
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                    />
                    <BigButton
                      title="Add Date Field"
                      onClick={() =>
                        setPendingField({
                          type: "date",
                          width: 180,
                          height: 40,
                        })
                      }
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/x-pdf-field",
                          JSON.stringify({
                            type: "date",
                            width: 180,
                            height: 40,
                          })
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                    />
                    <BigButton
                      title="Add Signature Field"
                      onClick={() =>
                        setPendingField({
                          type: "signature",
                          width: 200,
                          height: 64,
                        })
                      }
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/x-pdf-field",
                          JSON.stringify({
                            type: "signature",
                            width: 200,
                            height: 64,
                          })
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                    />
                    <BigButton
                      title="Add Photo Field"
                      onClick={() =>
                        setPendingField({
                          type: "photo",
                          width: 200,
                          height: 140,
                        })
                      }
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/x-pdf-field",
                          JSON.stringify({
                            type: "photo",
                            width: 200,
                            height: 140,
                          })
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                    />
                    <BigButton
                      title="Add Checkbox"
                      onClick={() =>
                        setPendingField({
                          type: "checkbox",
                          width: 100,
                          height: 30,
                        })
                      }
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/x-pdf-field",
                          JSON.stringify({
                            type: "checkbox",
                            width: 100,
                            height: 30,
                          })
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                    />
                    <BigButton title="Clear Fields" onClick={clearFields} />
                    <BigButton
                      title="Save Template"
                      onClick={() => {
                        const templateName = prompt("Enter template name:");
                        if (templateName) {
                          saveTemplate(templateName);
                        }
                      }}
                    />
                    <BigButton
                      title="My Templates"
                      onClick={() => setTemplateListVisible(true)}
                    />
                    <BigButton
                      title="Reset"
                      onClick={() => {
                        setTextInputVisible(false);
                        setSignatureDialogVisible(false);
                        setSignatureURL(null);
                        setPdf(null);
                        setTotalPages(0);
                        setPageNum(0);
                        setPageDetails(null);
                      }}
                    />
                  </>
                )}

                {mode === "fill" && (
                  <>
                    <BigButton
                      title="Flatten & Download"
                      onClick={flattenAndDownload}
                    />
                  </>
                )}

                {/* In view mode, no extra buttons shown */}
              </div>
            </div>
            <PagingControl
              pageNum={pageNum}
              setPageNum={setPageNum}
              totalPages={totalPages}
            />
          </>
        ) : null}

        {/* Template List Modal */}
        <Modal
          isVisible={templateListVisible}
          onClose={() => setTemplateListVisible(false)}
          style={{ width: "fit-content" }}
        >
          <div
            style={{
              padding: 20,
              maxWidth: 600,
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 20 }}>My Templates</h2>

            {templates.length === 0 ? (
              <p style={{ textAlign: "center", color: "#666", padding: 40 }}>
                No templates saved yet. Create a form and save it as a template!
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                {templates.map((template) => (
                  <div
                    key={template.id}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      padding: 16,
                      backgroundColor: "#f9f9f9",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            margin: 0,
                            marginBottom: 4,
                            color: "#333",
                          }}
                        >
                          {template.name}
                        </h3>
                        <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
                          {template.fields.length} fields • Created{" "}
                          {new Date(template.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteTemplate(template.id)}
                        style={{
                          background: "none",
                          border: "1px solid #c33",
                          color: "#c33",
                          borderRadius: 4,
                          padding: "4px 8px",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                        title="Delete template"
                      >
                        Delete
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => loadTemplate(template)}
                        style={{
                          background: primary45,
                          color: "white",
                          border: "none",
                          borderRadius: 4,
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        Load Template
                      </button>

                      <button
                        onClick={() => {
                          setShareTemplateId(template.id);
                          setEmailDialogOpen(true);
                        }}
                        style={{
                          background: "#28a745",
                          color: "white",
                          border: "none",
                          borderRadius: 4,
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        Share Template
                      </button>

                      <button
                        onClick={async () => {
                          setFields(template.fields);
                          try {
                            const storedPdf = await getPdfForTemplate(
                              template.id
                            );
                            if (storedPdf) {
                              setPdf(storedPdf);
                              setMode("fill");
                              setTemplateListVisible(false);
                            } else {
                              setPdf(null);
                              setMode("build");
                              alert(
                                "This template has no PDF stored. Please upload the PDF before filling."
                              );
                            }
                          } catch (e) {
                            console.warn(
                              "Failed to load PDF from IndexedDB:",
                              e
                            );
                            setPdf(null);
                            setMode("build");
                            alert(
                              "Failed to load the PDF for this template. Please upload it again."
                            );
                          }
                        }}
                        style={{
                          background: "#17a2b8",
                          color: "white",
                          border: "none",
                          borderRadius: 4,
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                      >
                        Fill Template
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: 20 }}>
              <button
                onClick={() => setTemplateListVisible(false)}
                style={{
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  padding: "10px 20px",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>

        {/* Email Share Dialog */}
        <Modal
          isVisible={emailDialogOpen}
          onClose={() => setEmailDialogOpen(false)}
          style={{ width: "fit-content" }}
        >
          <div style={{ padding: 16, width: 380 }}>
            <h3 style={{ marginTop: 0 }}>Send Template Link</h3>
            <div style={{ marginBottom: 8, fontSize: 14 }}>Recipient Email</div>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="client@example.com"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 8,
                marginBottom: 12,
                border: "1px solid #ccc",
                borderRadius: 4,
                fontSize: 14,
              }}
            />
            <div style={{ marginBottom: 6, fontSize: 14 }}>Share Link</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                readOnly
                value={
                  shareTemplateId
                    ? generateShareableLink(shareTemplateId, {
                        recipientOnly: true,
                      })
                    : ""
                }
                style={{
                  flex: 1,
                  boxSizing: "border-box",
                  padding: 8,
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  fontSize: 12,
                }}
              />
              <button
                onClick={() => {
                  if (!shareTemplateId) return;
                  const link = generateShareableLink(shareTemplateId, {
                    recipientOnly: true,
                  });
                  navigator.clipboard
                    .writeText(link)
                    .then(() => alert("Link copied"))
                    .catch(() => prompt("Copy this link:", link));
                }}
                style={{
                  background: "#007bff",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  padding: "8px 12px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Copy
              </button>
            </div>
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setEmailDialogOpen(false)}
                style={{
                  background: "#eee",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!shareTemplateId) return;
                  const link = generateShareableLink(shareTemplateId, {
                    recipientOnly: true,
                  });
                  const subject = encodeURIComponent(
                    "Please fill and sign the document"
                  );
                  const body = encodeURIComponent(
                    `Hello,\n\nPlease open the link below to fill and sign the document.\n\n${link}\n\nThank you.`
                  );
                  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                    recipientEmail || ""
                  )}&su=${subject}&body=${body}`;
                  window.open(gmail, "_blank");
                }}
                style={{
                  background: "#db4437",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                Open Gmail
              </button>
              <button
                onClick={() => {
                  if (!shareTemplateId) return;
                  const shareLink = generateShareableLink(shareTemplateId, {
                    recipientOnly: true,
                  });
                  const subject = encodeURIComponent(
                    "Please fill and sign the document"
                  );
                  const body = encodeURIComponent(
                    `Hello,\n\nPlease open the link below to fill and sign the document.\n\n${shareLink}\n\nThank you.`
                  );
                  const mailto = `mailto:${encodeURIComponent(
                    recipientEmail || ""
                  )}?subject=${subject}&body=${body}`;
                  window.location.href = mailto;
                  setEmailDialogOpen(false);
                  setRecipientEmail("");
                }}
                style={{
                  background: "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                Send Email
              </button>
            </div>
          </div>
        </Modal>
      </div>

      {sigFieldId && (
        <AddSigDialog
          autoDate={false}
          setAutoDate={() => {}}
          onClose={() => setSigFieldId(null)}
          onConfirm={(url) => {
            setValuesByFieldId((prev) => ({ ...prev, [sigFieldId]: url }));
            setSigFieldId(null);
          }}
        />
      )}

      {/* Guided Fill Modal */}
      <Modal
        isVisible={fillModalOpen && mode === "fill"}
        onClose={() => setFillModalOpen(false)}
        style={{ width: "fit-content" }}
      >
        {(() => {
          const total = fields.length;
          const field = fields[fillIndex] || null;
          if (!field || total === 0) {
            return (
              <div style={{ padding: 16 }}>
                <div style={{ marginBottom: 12 }}>No fields to fill.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <BigButton
                    title="Close"
                    onClick={() => setFillModalOpen(false)}
                  />
                </div>
              </div>
            );
          }
          const label = `${field.type} ${field.required ? "(required)" : ""}`;
          const val = valuesByFieldId[field.id];
          const setVal = (v) =>
            setValuesByFieldId((prev) => ({ ...prev, [field.id]: v }));
          function next() {
            setFillIndex((i) => Math.min(i + 1, total - 1));
          }
          function prev() {
            setFillIndex((i) => Math.max(i - 1, 0));
          }
          return (
            <div style={{ padding: 16, minWidth: 320 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                Fill Field {fillIndex + 1} / {total}
              </div>
              <div style={{ fontSize: 14, color: "#2a6", marginBottom: 8 }}>
                {label}
              </div>
              <div style={{ marginBottom: 12 }}>
                {field.type === "text" && (
                  <input
                    style={{
                      width: "100%",
                      padding: 6,
                      border: "1px solid #2a6",
                    }}
                    value={val || ""}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder="Enter text"
                  />
                )}
                {field.type === "date" && (
                  <input
                    type="date"
                    style={{
                      width: "100%",
                      padding: 6,
                      border: "1px solid #2a6",
                    }}
                    value={val || dayjs().format("YYYY-MM-DD")}
                    onChange={(e) => setVal(e.target.value)}
                  />
                )}
                {field.type === "checkbox" && (
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <input
                      type="checkbox"
                      checked={!!val}
                      onChange={(e) => setVal(e.target.checked)}
                    />
                    Check
                  </label>
                )}
                {field.type === "signature" && (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    {val ? (
                      <img
                        src={val}
                        alt="signature"
                        style={{ maxHeight: 60 }}
                      />
                    ) : null}
                    <BigButton
                      title="Add signature"
                      onClick={() => setSigFieldId(field.id)}
                    />
                  </div>
                )}
                {field.type === "photo" && (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    {val ? (
                      <img src={val} alt="photo" style={{ maxHeight: 60 }} />
                    ) : null}
                    <label>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = async (ev) => {
                            const dataUrl = ev.target.result;
                            const normalized = await ensurePngOrJpegDataUrl(
                              dataUrl
                            );
                            setVal(normalized);
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <BigButton title="Upload" onClick={() => {}} />
                    </label>
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "space-between",
                }}
              >
                <BigButton
                  title="Back"
                  onClick={prev}
                  disabled={fillIndex === 0}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <BigButton
                    title="Close"
                    onClick={() => setFillModalOpen(false)}
                  />
                  <BigButton
                    title="Next"
                    onClick={next}
                    disabled={fillIndex >= total - 1}
                  />
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

export default App;
