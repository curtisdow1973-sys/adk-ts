import { useRef, useState } from "react";

export interface UseChatAttachmentsReturn {
	attachedFiles: File[];
	setAttachedFiles: React.Dispatch<React.SetStateAction<File[]>>;
	showAttachmentDropdown: boolean;
	setShowAttachmentDropdown: React.Dispatch<React.SetStateAction<boolean>>;
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	photoInputRef: React.RefObject<HTMLInputElement | null>;
	handleFileAttach: () => void;
	handlePhotoAttach: () => void;
	handleScreenshot: () => Promise<void>;
	handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	removeFile: (index: number) => void;
	resetAttachments: () => void;
}

export function useChatAttachments(): UseChatAttachmentsReturn {
	const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
	const [showAttachmentDropdown, setShowAttachmentDropdown] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const photoInputRef = useRef<HTMLInputElement>(null);

	const handleFileAttach = () => {
		setShowAttachmentDropdown(false);
		fileInputRef.current?.click();
	};

	const handlePhotoAttach = () => {
		setShowAttachmentDropdown(false);
		photoInputRef.current?.click();
	};

	const handleScreenshot = async () => {
		setShowAttachmentDropdown(false);
		try {
			// Use the browser's screen capture API
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
			});

			// Create a video element to capture the frame
			const video = document.createElement("video");
			video.srcObject = stream;
			video.play();

			video.addEventListener("loadedmetadata", () => {
				// Create canvas to capture the frame
				const canvas = document.createElement("canvas");
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				const ctx = canvas.getContext("2d");

				if (ctx) {
					ctx.drawImage(video, 0, 0);

					// Convert to blob and create file
					canvas.toBlob((blob) => {
						if (blob) {
							const file = new File([blob], `screenshot-${Date.now()}.png`, {
								type: "image/png",
							});
							setAttachedFiles((prev) => [...prev, file]);
						}

						// Stop the stream
						stream.getTracks().forEach((track) => track.stop());
					}, "image/png");
				}
			});
		} catch (error) {
			console.error("Failed to capture screenshot:", error);
		}
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		setAttachedFiles((prev) => [...prev, ...files]);
		e.target.value = ""; // Reset input
	};

	const removeFile = (index: number) => {
		setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
	};

	const resetAttachments = () => {
		setAttachedFiles([]);
	};

	return {
		attachedFiles,
		setAttachedFiles,
		showAttachmentDropdown,
		setShowAttachmentDropdown,
		fileInputRef,
		photoInputRef,
		handleFileAttach,
		handlePhotoAttach,
		handleScreenshot,
		handleFileChange,
		removeFile,
		resetAttachments,
	};
}
