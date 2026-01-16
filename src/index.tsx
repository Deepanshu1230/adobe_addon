import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";

// Wait for SDK to be ready before rendering
const addOnUISdk: any = (window as any).addOnUISdk;

if (addOnUISdk && addOnUISdk.ready) {
    addOnUISdk.ready.then(() => {
        console.log("addOnUISdk is ready for use.");
        const root = createRoot(document.getElementById("root")!);
        root.render(<App />);
    });
} else {
    // Fallback: render immediately (for testing without SDK)
    console.log("SDK not detected, rendering in fallback mode.");
    const root = createRoot(document.getElementById("root")!);
    root.render(<App />);
}
