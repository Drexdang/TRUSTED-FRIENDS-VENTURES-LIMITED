// Audit trail utility
async function logAudit(action, collection, documentId, details) {
    try {
        const user = auth.currentUser;
        if (!user) return;
        await db.collection('auditLogs').add({
            user: user.email,
            userId: user.uid,
            action: action, // 'CREATE', 'UPDATE', 'DELETE', 'WRITE_OFF'
            collection: collection,
            documentId: documentId,
            details: details,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Audit log failed:', error);
    }
}

window.logAudit = logAudit;