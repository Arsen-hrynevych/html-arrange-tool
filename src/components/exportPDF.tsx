import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { Slide } from "../lib/slide";
  
export const exportPdf = (slides: Slide[]) => {
    if (slides.length === 0) return;
    const pdfWidth = 1280;
    const pdfHeight = 720;
    const tempHost = document.createElement("div");
    tempHost.style.position = "fixed";
    tempHost.style.left = "-10000px";
    tempHost.style.top = "0";
    tempHost.style.width = `${pdfWidth}px`;
    tempHost.style.height = `${pdfHeight}px`;
    tempHost.style.overflow = "hidden";
    tempHost.style.pointerEvents = "none";
    document.body.appendChild(tempHost);

    const cleanup = () => {
        document.body.removeChild(tempHost);
    };

    const waitForFrameContent = async (frame: HTMLIFrameElement) => {
        await new Promise<void>((resolve) => {
        frame.addEventListener("load", () => resolve(), { once: true });
        });

        const frameDocument = frame.contentDocument;
        if (!frameDocument) return;

        await Promise.all(
        Array.from(frameDocument.images).map(
            (image) =>
            new Promise<void>((resolve) => {
                if (image.complete) {
                resolve();
                return;
                }

                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
            })
        )
        );

        if (frameDocument.fonts?.ready) {
        await frameDocument.fonts.ready;
        }

        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        await new Promise((resolve) => setTimeout(resolve, 50));
    };

    const render = async () => {
        const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [pdfWidth, pdfHeight],
        });

        for (let index = 0; index < slides.length; index++) {
        const slide = slides[index];
        const frame = document.createElement("iframe");
        frame.srcdoc = slide.originalHtml;
        frame.width = String(pdfWidth);
        frame.height = String(pdfHeight);
        frame.style.width = `${pdfWidth}px`;
        frame.style.height = `${pdfHeight}px`;
        frame.style.border = "0";
        frame.style.display = "block";
        frame.style.background = "#fff";
        tempHost.appendChild(frame);

        await waitForFrameContent(frame);

        const frameDocument = frame.contentDocument;
        if (!frameDocument?.body) {
            throw new Error(`Could not render slide: ${slide.name}`);
        }

        const canvas = await html2canvas(frameDocument.body, {
            backgroundColor: "#ffffff",
            scale: 2,
            useCORS: true,
            logging: false,
            width: pdfWidth,
            height: pdfHeight,
            windowWidth: pdfWidth,
            windowHeight: pdfHeight,
        });

        const imageData = canvas.toDataURL("image/png");
        if (index > 0) {
            pdf.addPage([pdfWidth, pdfHeight], "landscape");
        }
        pdf.addImage(imageData, "PNG", 0, 0, pdfWidth, pdfHeight);
        tempHost.removeChild(frame);
        }

        pdf.save("presentation.pdf");
        cleanup();
    };

    render().catch((error) => {
        cleanup();
        console.error(error);
        alert("PDF export failed. Some slide content may not be supported by the canvas renderer.");
    });
};