import { primary45 } from "./utils/colors";

export function Header() {
  const styles = {
    container: {
      backgroundColor: "#e5e9f0",
      color: "#FFF",
      padding: 12,
      fontWeight: 600,
    },
  };
  return (
    <div style={styles.container} className="flex items-center justify-between">
      <div style={{ color: "black" }}>
        <p>Open PDF Sign</p>
      </div>
      <button style={{ color: "black" }} className="flex items-center gap-2">
        <i className="fa-solid fa-floppy-disk"></i>
        <span>Save</span>
      </button>
    </div>
  );
}
