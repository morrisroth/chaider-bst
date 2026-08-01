// Documents created before multi-field support only have a single
// signaturePage/X/Y/Width/Height. Normalizing here lets every route treat
// every document — old or new — as having a `signatureFields` array.
function getSignatureFields(doc) {
  if (Array.isArray(doc.signatureFields)) return doc.signatureFields;
  if (doc.signaturePage != null) {
    return [{
      key: 'signature',
      label: 'חתימה',
      page: doc.signaturePage,
      x: doc.signatureX,
      y: doc.signatureY,
      width: doc.signatureWidth,
      height: doc.signatureHeight
    }];
  }
  return [];
}

module.exports = { getSignatureFields };
