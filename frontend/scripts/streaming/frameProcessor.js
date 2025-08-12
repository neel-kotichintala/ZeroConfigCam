(function () {
  async function processBinaryFrame(frameData) {
    const blob = await window.ImageBinaryConverter.convertBinaryDataToBlob(frameData);
    return URL.createObjectURL(blob);
  }

  window.FrameProcessor = {
    processBinaryFrame,
  };
})();

