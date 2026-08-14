/**
 * Client-side image compression and resizing utility.
 * Optimizes large DSLR photos and mobile camera selfies down to ~200-400KB
 * while maintaining excellent quality and high resolution for AI face recognition.
 */
export async function compressImage(
  file: File | Blob,
  maxDimension = 1600,
  quality = 0.85
): Promise<File> {
  // If not running in browser, return original as File
  if (typeof window === "undefined" || !(file instanceof Blob)) {
    if (file instanceof File) return file;
    return new File([file], "selfie.jpg", { type: "image/jpeg" });
  }

  // If already a small JPEG under 350KB, keep as is
  if (file.size <= 350 * 1024 && file.type === "image/jpeg" && file instanceof File) {
    return file;
  }

  return new Promise<File>((resolve) => {
    const reader = new FileReader();

    reader.onerror = () => {
      if (file instanceof File) resolve(file);
      else resolve(new File([file], "selfie.jpg", { type: "image/jpeg" }));
    };

    reader.onload = (e) => {
      const img = new Image();

      img.onerror = () => {
        if (file instanceof File) resolve(file);
        else resolve(new File([file], "selfie.jpg", { type: "image/jpeg" }));
      };

      img.onload = () => {
        try {
          let { width, height } = img;

          // Scale down if either dimension exceeds maxDimension
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            if (file instanceof File) return resolve(file);
            return resolve(new File([file], "selfie.jpg", { type: "image/jpeg" }));
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const fileName =
                  file instanceof File
                    ? file.name.replace(/\.[^/.]+$/, "") + ".jpg"
                    : "selfie.jpg";
                const compressedFile = new File([blob], fileName, {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                if (file instanceof File) resolve(file);
                else resolve(new File([file], "selfie.jpg", { type: "image/jpeg" }));
              }
            },
            "image/jpeg",
            quality
          );
        } catch {
          if (file instanceof File) resolve(file);
          else resolve(new File([file], "selfie.jpg", { type: "image/jpeg" }));
        }
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
