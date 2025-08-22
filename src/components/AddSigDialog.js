import { Dialog } from "./Dialog";
import SignatureCanvas from "react-signature-canvas";
import { ConfirmOrCancel } from "./ConfirmOrCancel";
import { primary45 } from "../utils/colors";
import { useRef, useState } from "react";

export function AddSigDialog({ onConfirm, onClose, autoDate, setAutoDate }) {
  const sigRef = useRef(null);
  const [signatureType, setSignatureType] = useState("draw"); // "draw", "type", "upload"
  const [typedSignature, setTypedSignature] = useState("");
  const [uploadedImage, setUploadedImage] = useState(null);
  const [fontFamily, setFontFamily] = useState("cursive");

  const styles = {
    container: {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      minWidth: "400px",
    },
    typeSelector: {
      display: "flex",
      gap: "8px",
      justifyContent: "center",
      marginBottom: "16px",
    },
    typeButton: {
      padding: "8px 16px",
      border: "1px solid #ccc",
      borderRadius: "4px",
      background: "white",
      cursor: "pointer",
      fontSize: "14px",
    },
    activeTypeButton: {
      padding: "8px 16px",
      border: `1px solid ${primary45}`,
      borderRadius: "4px",
      background: primary45,
      color: "white",
      cursor: "pointer",
      fontSize: "14px",
    },
    sigContainer: {
      display: "flex",
      justifyContent: "center",
    },
    sigBlock: {
      display: "inline-block",
      border: `1px solid ${primary45}`,
      minHeight: "200px",
      minWidth: "400px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    instructions: {
      display: "flex",
      justifyContent: "space-between",
      textAlign: "center",
      color: primary45,
      marginTop: 8,
      width: 600,
      alignSelf: "center",
    },
    instructionsContainer: {
      display: "flex",
      justifyContent: "center",
    },
    typeInput: {
      width: "100%",
      padding: "12px",
      fontSize: "24px",
      border: "none",
      outline: "none",
      textAlign: "center",
      fontFamily: "cursive",
    },
    fontSelector: {
      marginTop: "8px",
      display: "flex",
      gap: "8px",
      justifyContent: "center",
    },
    fontOption: {
      padding: "4px 8px",
      border: "1px solid #ccc",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "12px",
    },
    activeFontOption: {
      padding: "4px 8px",
      border: `1px solid ${primary45}`,
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "12px",
      background: primary45,
      color: "white",
    },
    uploadArea: {
      border: "2px dashed #ccc",
      borderRadius: "8px",
      padding: "40px",
      textAlign: "center",
      cursor: "pointer",
      transition: "border-color 0.3s",
    },
    uploadAreaHover: {
      border: "2px dashed #2a6",
      borderRadius: "8px",
      padding: "40px",
      textAlign: "center",
      cursor: "pointer",
      transition: "border-color 0.3s",
    },
    previewImage: {
      maxWidth: "100%",
      maxHeight: "200px",
      border: "1px solid #ccc",
      borderRadius: "4px",
    },
  };

  const fonts = [
    { name: "Cursive", value: "cursive" },
    { name: "Dancing Script", value: "'Dancing Script', cursive" },
    { name: "Great Vibes", value: "'Great Vibes', cursive" },
    { name: "Pacifico", value: "'Pacifico', cursive" },
    { name: "Satisfy", value: "'Satisfy', cursive" },
    { name: "Handwriting", value: "'Indie Flower', cursive" },
  ];

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const getSignatureData = () => {
    switch (signatureType) {
      case "draw":
        return sigRef.current?.toDataURL() || null;
      case "type":
        if (!typedSignature.trim()) return null;
        // Create a canvas with the typed signature
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 400;
        canvas.height = 100;

        // Set font
        ctx.font = `24px ${fontFamily}`;
        ctx.fillStyle = "#000";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Draw text
        ctx.fillText(typedSignature, canvas.width / 2, canvas.height / 2);

        return canvas.toDataURL();
      case "upload":
        return uploadedImage;
      default:
        return null;
    }
  };

  const renderSignatureArea = () => {
    switch (signatureType) {
      case "draw":
        return (
          <div style={styles.sigBlock}>
            <SignatureCanvas
              velocityFilterWeight={1}
              ref={sigRef}
              canvasProps={{
                width: "400",
                height: 200,
                className: "sigCanvas",
              }}
            />
          </div>
        );
      case "type":
        return (
          <div style={styles.sigBlock}>
            <input
              type="text"
              value={typedSignature}
              onChange={(e) => setTypedSignature(e.target.value)}
              placeholder="Type your signature here..."
              style={{
                ...styles.typeInput,
                fontFamily: fontFamily,
              }}
            />
          </div>
        );
      case "upload":
        return (
          <div style={styles.sigBlock}>
            {uploadedImage ? (
              <img
                src={uploadedImage}
                alt="Uploaded signature"
                style={styles.previewImage}
              />
            ) : (
              <label style={styles.uploadArea}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <div>
                  <div style={{ fontSize: "18px", marginBottom: "8px" }}>
                    📁
                  </div>
                  <div>Click to upload signature image</div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      marginTop: "4px",
                    }}
                  >
                    Supports PNG, JPG, GIF
                  </div>
                </div>
              </label>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog
      isVisible={true}
      title={"Add signature"}
      style={{ zIndex: "20000", width: "fit-content" }}
      body={
        <div style={styles.container}>
          {/* Signature Type Selector */}
          <div style={styles.typeSelector}>
            <button
              style={
                signatureType === "draw"
                  ? styles.activeTypeButton
                  : styles.typeButton
              }
              onClick={() => setSignatureType("draw")}
            >
              ✏️ Draw
            </button>
            <button
              style={
                signatureType === "type"
                  ? styles.activeTypeButton
                  : styles.typeButton
              }
              onClick={() => setSignatureType("type")}
            >
              ⌨️ Type
            </button>
            <button
              style={
                signatureType === "upload"
                  ? styles.activeTypeButton
                  : styles.typeButton
              }
              onClick={() => setSignatureType("upload")}
            >
              📁 Upload
            </button>
          </div>

          {/* Font Selector for Typed Signature */}
          {signatureType === "type" && (
            <div style={styles.fontSelector}>
              {fonts.map((font) => (
                <button
                  key={font.value}
                  style={
                    fontFamily === font.value
                      ? styles.activeFontOption
                      : styles.fontOption
                  }
                  onClick={() => setFontFamily(font.value)}
                >
                  {font.name}
                </button>
              ))}
            </div>
          )}

          {/* Signature Area */}
          <div style={styles.sigContainer}>{renderSignatureArea()}</div>

          {/* Instructions */}
          <div style={styles.instructionsContainer}>
            <div style={styles.instructions}>
              <div>
                Auto date/time{" "}
                <input
                  type={"checkbox"}
                  checked={autoDate}
                  onChange={(e) => setAutoDate(e.target.checked)}
                />
              </div>
              <div>
                {signatureType === "draw" && "Draw your signature above"}
                {signatureType === "type" && "Type your signature above"}
                {signatureType === "upload" && "Upload your signature image"}
              </div>
            </div>
          </div>

          <ConfirmOrCancel
            onCancel={onClose}
            onConfirm={() => {
              const signatureData = getSignatureData();
              if (signatureData) {
                onConfirm(signatureData);
              } else {
                alert("Please provide a signature first.");
              }
            }}
          />
        </div>
      }
    />
  );
}
