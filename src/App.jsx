
import { useEffect, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph } from "docx";
import { saveAs } from "file-saver";
import {
  Camera, Upload, FileText, Copy, Download,
  Trash2, ScanText, LoaderCircle, ImagePlus,
  X, CheckCircle, Languages
} from "lucide-react";
import "./App.css";

export default function App() {
  const [images, setImages] = useState([]);
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("eng+hin+asm");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  // Add multiple images
  const addImages = (files) => {
    const selected = Array.from(files)
      .filter(file => file.type.startsWith("image/"));

    if (!selected.length) {
      setError("Please select valid image files.");
      return;
    }

    const newImages = selected.map(file => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
      name: file.name
    }));

    setImages(prev => [...prev, ...newImages]);
    setError("");
  };

  // Remove one image
  const removeImage = (id) => {
    setImages(prev => {
      const image = prev.find(item => item.id === id);
      if (image) URL.revokeObjectURL(image.url);
      return prev.filter(item => item.id !== id);
    });
  };

  // Start live camera
const openCamera = async () => {
  try {
    if (Capacitor.isNativePlatform()) {
      const photo = await Camera.getPhoto({
        quality: 95,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });

      const response = await fetch(photo.webPath);
      const blob = await response.blob();

      const file = new File(
        [blob],
        `SnapText-${Date.now()}.jpg`,
        { type: blob.type || 'image/jpeg' }
      );

      addImages([file]);
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });

      streamRef.current = stream;
      setCameraOpen(true);
    }
  } catch (error) {
    console.error(error);
    setError('Camera permission denied or camera unavailable.');
  }
};

  // Attach camera stream to video
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);

  // Stop camera
  const closeCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  // Capture photo
  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(blob => {
      if (!blob) return;

      const file = new File(
        [blob],
        `camera-${Date.now()}.jpg`,
        { type: "image/jpeg" }
      );

      addImages([file]);
      closeCamera();
    }, "image/jpeg", 0.95);
  };

  // OCR: Extract text from all images
  const extractText = async () => {
    if (!images.length) {
      setError("Please upload or capture an image first.");
      return;
    }

    let worker;

    try {
      setLoading(true);
      setProgress(0);
      setText("");
      setError("");
      setStatus("Loading OCR language data...");

      worker = await createWorker(language, 1, {
        logger: message => {
          if (message.status === "recognizing text") {
            setProgress(Math.round(message.progress * 100));
          }
          if (message.status) {
            setStatus(message.status);
          }
        }
      });

      let result = "";

      for (let i = 0; i < images.length; i++) {
        setStatus(`Scanning image ${i + 1} of ${images.length}`);

        const output = await worker.recognize(images[i].file);

        result +=
          `\n\n--- ${images[i].name} ---\n\n` +
          output.data.text.trim();

        setProgress(Math.round(((i + 1) / images.length) * 100));
      }

      setText(result.trim());
      setStatus("Text extraction completed!");
    } catch (err) {
      console.error(err);
      setError("OCR failed. Check your internet connection and language data.");
    } finally {
      if (worker) await worker.terminate();
      setLoading(false);
    }
  };

  // Copy text
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Text copied successfully!");
    } catch {
      setError("Clipboard access failed. Please copy manually.");
    }
  };

  // Download TXT
  const downloadTXT = () => {
    const blob = new Blob([text], {
      type: "text/plain;charset=utf-8"
    });
    saveAs(blob, "SnapText-Extracted-Text.txt");
  };

  // Download Word
  const downloadWord = async () => {
    try {
      const paragraphs = text.split("\n").map(
        line => new Paragraph({ text: line })
      );

      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs
        }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, "SnapText-Extracted-Text.docx");
    } catch (err) {
      setError("Word download failed.");
    }
  };

  // Download PDF
  
const downloadPDF = () => {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    setError("Please allow pop-ups to export PDF.");
    return;
  }

  const safeText = text.replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]
  );

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>SnapText Extracted Text</title>
      <style>
        body {
          font-family: Arial, "Noto Sans Devanagari",
            "Noto Sans Bengali", sans-serif;
          padding: 35px;
          color: #222;
        }
        pre {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font: inherit;
          line-height: 1.7;
        }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <pre>${safeText}</pre>
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};


  // Clear everything
  const clearAll = () => {
    images.forEach(item => URL.revokeObjectURL(item.url));
    setImages([]);
    setText("");
    setProgress(0);
    setStatus("");
    setError("");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <ScanText size={25} />
          </div>
          <div>
            <h2>SnapText <span>OCR</span></h2>
            <small>Image to editable text converter</small>
          </div>
        </div>
        <div className="header-tag">
          <span className="online-dot"></span>
          Browser Based OCR
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <span className="eyebrow">SMART TEXT RECOGNITION</span>
          <h1>Turn your photos into <span>editable text.</span></h1>
          <p>
            Capture a document or upload images.
            Extract, edit, copy and download text easily.
          </p>
        </section>

        <section className="workspace">
          <div className="section-heading">
            <div>
              <h3><ImagePlus size={20}/> Upload Documents</h3>
              <p>Upload one or multiple images.</p>
            </div>
            <span className="count">{images.length} Images</span>
          </div>

          <div className="upload-box">
            <div className="upload-icon">
              <Upload size={30}/>
            </div>
            <h3>Choose your images</h3>
            <p>JPG, JPEG, PNG, WEBP supported</p>

            <div className="upload-actions">
              <button
                className="primary-btn"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={17}/> Upload Images
              </button>

              <button className="secondary-btn" onClick={openCamera}>
                <Camera size={17}/> Open Camera
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={e => {
                addImages(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {images.length > 0 && (
            <div className="image-list">
              <div className="list-title">
                <strong>Selected Images</strong>
                <button className="text-btn" onClick={clearAll}>
                  Clear All
                </button>
              </div>

              <div className="image-grid">
                {images.map(image => (
                  <div className="image-card" key={image.id}>
                    <img src={image.url} alt={image.name}/>
                    <span title={image.name}>{image.name}</span>
                    <button
                      className="remove-btn"
                      onClick={() => removeImage(image.id)}
                      aria-label="Remove image"
                    >
                      <X size={16}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="language-row">
            <label><Languages size={18}/> OCR Languages</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              disabled={loading}
            >
              <option value="eng+hin+asm">
                English + Hindi + Assamese
              </option>
              <option value="eng">English</option>
              <option value="hin">Hindi</option>
              <option value="asm">Assamese</option>
              <option value="eng+hin">English + Hindi</option>
              <option value="eng+asm">English + Assamese</option>
            </select>
          </div>

          <button
            className="scan-btn"
            onClick={extractText}
            disabled={loading || !images.length}
          >
            {loading
              ? <><LoaderCircle className="spin"/> Processing...</>
              : <><ScanText size={20}/> Extract Text from Images</>}
          </button>

          {loading && (
            <div className="progress-area">
              <div className="progress-label">
                <span>{status}</span>
                <strong>{progress}%</strong>
              </div>
              <div className="progress-track">
                <div style={{width: `${progress}%`}}/>
              </div>
            </div>
          )}
        </section>

        {error && <div className="error-message">{error}</div>}

        {status && !loading && !error && (
          <div className="success-message">
            <CheckCircle size={17}/> {status}
          </div>
        )}

        <section className="editor-section">
          <div className="section-heading">
            <div>
              <h3><FileText size={20}/> Extracted Text</h3>
              <p>Edit your extracted content below.</p>
            </div>
            <span className="count">
              {text.length} Characters
            </span>
          </div>

          <textarea
            className="text-editor"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Your extracted text will appear here..."
            spellCheck="false"
          />

          <div className="editor-actions">
            <button
              className="secondary-btn"
              onClick={copyText}
              disabled={!text.trim()}
            >
              <Copy size={17}/> Copy
            </button>

            <button
              className="download-btn"
              onClick={downloadTXT}
              disabled={!text.trim()}
            >
              <Download size={17}/> TXT
            </button>

            <button
              className="download-btn"
              onClick={downloadWord}
              disabled={!text.trim()}
            >
              <Download size={17}/> Word
            </button>

            <button
              className="download-btn"
              onClick={downloadPDF}
              disabled={!text.trim()}
            >
              <Download size={17}/> PDF
            </button>
          </div>
        </section>

        <footer>
          <p>SnapText OCR · Your images are processed in your browser.</p>
        </footer>
      </main>

      {cameraOpen && (
        <div className="camera-overlay">
          <div className="camera-modal">
            <div className="camera-heading">
              <h3><Camera size={20}/> Capture Document</h3>
              <button onClick={closeCamera}><X/></button>
            </div>

            <video ref={videoRef} autoPlay playsInline muted/>

            <div className="camera-controls">
              <button className="secondary-btn" onClick={closeCamera}>
                Cancel
              </button>
              <button className="primary-btn" onClick={capturePhoto}>
                <Camera size={18}/> Capture Photo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
