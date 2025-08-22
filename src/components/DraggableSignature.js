import Draggable from "react-draggable";
import { BigButton } from "./BigButton"; // The default
// import { FaCheck, FaTimes } from "react-icons/fa";
import { cleanBorder, errorColor, goodColor, primary45 } from "../utils/colors";
import React from "react";

export default function DraggableSignature({
  url,
  onEnd,
  onSet,
  onCancel,
  innerRef,
  bounds,
}) {
  const styles = {
    container: {
      // position: "absolute",
      backgroundColor: "black",
      zIndex: 100000,
      border: `2px solid ${primary45}`,
    },
    controls: {
      // position: "absolute",
      right: 0,
      display: "inline-block",
      backgroundColor: primary45,
      // borderRadius: 4,
    },
    smallButton: {
      display: "inline-block",
      cursor: "pointer",
      padding: 4,
    },
  };
  return (
    <Draggable bounds={bounds} onStop={onEnd}>
      <div ref={innerRef} style={styles.container}>
        <div style={styles.controls}>
          <div style={styles.smallButton} onClick={onSet}>
            {/* <FaCheck color={goodColor} /> */}
          </div>
          <div style={styles.smallButton} onClick={onCancel}>
            {/* <FaTimes color={errorColor} /> */}
          </div>
        </div>
        <img src={url} width={200} style={styles.img} draggable={false} />
      </div>
    </Draggable>
  );
}
