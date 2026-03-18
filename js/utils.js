function formatCurrency(amount) {
    return '₦' + Number(amount).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function showToast(message, type = 'success', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg text-white transform transition-all duration-300 ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
    }`;
    toast.textContent = message;
    toast.classList.remove('hidden', 'opacity-0');
    toast.classList.add('opacity-100');
    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, duration);
}

function calculateLoanFields(amount, rate, duration, adminFees, remitted, loanDate) {
    const interest = amount * (rate / 100) * duration;
    const dueDate = new Date(loanDate);
    dueDate.setMonth(dueDate.getMonth() + duration);
    const today = new Date();
    let penalty = 0;
    if (today > dueDate) {
        const diffDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
        const overdueMonths = Math.floor(diffDays / 30);
        penalty = amount * 0.10 * overdueMonths;
    }
    const provisional = amount + adminFees + interest - remitted;
    if (provisional <= 0) penalty = 0;
    const totalAdd = adminFees + interest + penalty;
    const gTotal = amount + totalAdd;
    const balance = Math.max(gTotal - remitted, 0);
    return {
        interest: Math.round(interest * 100) / 100,
        penalty: Math.round(penalty * 100) / 100,
        totalAdd: Math.round(totalAdd * 100) / 100,
        gTotal: Math.round(gTotal * 100) / 100,
        balance: Math.round(balance * 100) / 100
    };
}

function monthsOverdue(loanDate, duration) {
    if (!loanDate) return 0;
    const dueDate = new Date(loanDate);
    dueDate.setMonth(dueDate.getMonth() + duration);
    const today = new Date();
    if (today <= dueDate) return 0;
    const diffDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 30);
}

function timestampToDate(ts) {
    return ts ? ts.toDate() : new Date();
}

async function getNextLoanSN() {
    const snapshot = await db.collection('loans').orderBy('sn', 'desc').limit(1).get();
    if (snapshot.empty) return 1;
    return snapshot.docs[0].data().sn + 1;
}

window.formatCurrency = formatCurrency;
window.showToast = showToast;
window.calculateLoanFields = calculateLoanFields;
window.monthsOverdue = monthsOverdue;
window.timestampToDate = timestampToDate;
window.getNextLoanSN = getNextLoanSN;