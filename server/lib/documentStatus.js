// Derives the *effective* status of a document at a given moment, independent of
// whether `expired` has been persisted to disk yet (expiry is checked lazily).
//
// A signing link can be used by many different people (no single "signed"
// terminal state at the document level — each submission produces its own
// signature record). The only terminal states are revoked and expired.
function getEffectiveStatus(doc, now = new Date()) {
  if (!doc) return 'not-found';
  if (doc.status === 'revoked') return 'revoked';
  if (doc.expiresAt && now > new Date(doc.expiresAt)) return 'expired';
  if (doc.status === 'opened') return 'opened';
  return 'pending';
}

module.exports = { getEffectiveStatus };
