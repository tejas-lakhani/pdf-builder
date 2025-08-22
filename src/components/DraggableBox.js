import Draggable from "react-draggable";
import { FaCheck, FaTimes } from "react-icons/fa";
import { errorColor, goodColor, primary45 } from "../utils/colors";

export default function DraggableBox({
  label,
  width = 200,
  height = 64,
  onEnd,
  onDrag,
  onSet,
  onCancel,
  bounds,
}) {
  const styles = {
    container: {
      position: "absolute",
      zIndex: 100000,
      border: `2px dashed ${primary45}`,
      width,
      height,
      background: "rgba(255,255,255,0.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: primary45,
      fontWeight: 600,
      boxSizing: "border-box",
    },
    controls: {
      position: "absolute",
      right: 0,
      top: 0,
      display: "inline-block",
      backgroundColor: primary45,
    },
    smallButton: {
      display: "inline-block",
      cursor: "pointer",
      padding: 4,
    },
  };

  return (
    <Draggable bounds={bounds} onStop={onEnd} onDrag={onDrag}>
      <div style={styles.container}>
        <div style={styles.controls}>
          <div style={styles.smallButton} onClick={onSet}>
            <FaCheck color={goodColor} />
          </div>
          <div style={styles.smallButton} onClick={onCancel}>
            <FaTimes color={errorColor} />
          </div>
        </div>
        <div>{label}</div>
      </div>
    </Draggable>
  );
}
