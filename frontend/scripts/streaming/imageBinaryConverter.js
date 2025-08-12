(function () {
  function detectBinaryDataFormat(data) {
    if (data instanceof ArrayBuffer) return 'ArrayBuffer';
    if (data instanceof Uint8Array) return 'Uint8Array';
    if (data && typeof data === 'object' && data.type === 'Buffer' && Array.isArray(data.data)) return 'Buffer';
    if (typeof Blob !== 'undefined' && data instanceof Blob) return 'Blob';
    if (typeof data === 'string') return 'Base64String';
    if (data && typeof data === 'object' && data.constructor && data.constructor.name === 'Buffer') return 'NodeBuffer';
    if (data && typeof data === 'object' && typeof data.length === 'number') return 'ArrayLike';
    return 'Unknown';
  }

  function convertGrayscaleToImageBlob(grayscaleData, width, height) {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        for (let i = 0; i < grayscaleData.length; i++) {
          const grayValue = grayscaleData[i];
          const pixelIndex = i * 4;
          data[pixelIndex] = grayValue;
          data[pixelIndex + 1] = grayValue;
          data[pixelIndex + 2] = grayValue;
          data[pixelIndex + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      } catch (error) {
        reject(error);
      }
    });
  }

  async function convertBinaryDataToBlob(data, mimeType = 'image/jpeg') {
    const format = detectBinaryDataFormat(data);
    try {
      switch (format) {
        case 'ArrayBuffer': {
          const uint8View = new Uint8Array(data);
          const isValidJpeg =
            uint8View[0] === 0xFF &&
            uint8View[1] === 0xD8 &&
            uint8View[uint8View.length - 2] === 0xFF &&
            uint8View[uint8View.length - 1] === 0xD9;
          if (!isValidJpeg) {
            const possibleSizes = [
              { width: 320, height: 240 },
              { width: 640, height: 480 },
              { width: 160, height: 120 },
              { width: 176, height: 144 },
            ];
            for (const size of possibleSizes) {
              if (size.width * size.height === uint8View.length) {
                return await convertGrayscaleToImageBlob(uint8View, size.width, size.height);
              }
            }
            return new Blob([data], { type: 'application/octet-stream' });
          }
          return new Blob([data], { type: mimeType });
        }
        case 'Uint8Array':
          return new Blob([data], { type: mimeType });
        case 'Buffer': {
          const uint8Array = new Uint8Array(data.data);
          return new Blob([uint8Array], { type: mimeType });
        }
        case 'NodeBuffer': {
          const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          return new Blob([arrayBuffer], { type: mimeType });
        }
        case 'Blob':
          return data;
        case 'Base64String': {
          const binaryString = atob(data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
          return new Blob([bytes], { type: mimeType });
        }
        case 'ArrayLike': {
          const arrayData = Array.from(data);
          const uint8ArrayFromArray = new Uint8Array(arrayData);
          return new Blob([uint8ArrayFromArray], { type: mimeType });
        }
        default:
          return new Blob([data], { type: mimeType });
      }
    } catch (error) {
      console.error('Error converting binary data to Blob:', error);
      throw error;
    }
  }

  window.ImageBinaryConverter = {
    detectBinaryDataFormat,
    convertGrayscaleToImageBlob,
    convertBinaryDataToBlob,
  };
})();

