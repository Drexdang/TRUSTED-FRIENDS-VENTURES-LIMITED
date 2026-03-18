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

// Months overdue counting only from 2026-01-01
function monthsOverdueSince(loanDate, durationMonths, cutoffDate = new Date(2026, 0, 1)) {
    if (!loanDate) return 0;
    const dueDate = new Date(loanDate);
    dueDate.setMonth(dueDate.getMonth() + durationMonths);
    const today = new Date();

    const startDate = dueDate > cutoffDate ? dueDate : cutoffDate;
    if (today <= startDate) return 0;

    const diffDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 30);
}

// Auto penalty based on outstanding balance (provisional) and overdue months
function calculateLoanFields(amount, rate, duration, adminFees, remitted, loanDate) {
    const interest = amount * (rate / 100) * duration;
    // Balance before penalty: amount + interest + fees - paid
    const provisionalBalance = amount + adminFees + interest - remitted;
    let autoPenalty = 0;
    if (provisionalBalance > 0) {
        const overdueMonths = monthsOverdueSince(loanDate, duration);
        autoPenalty = provisionalBalance * 0.10 * overdueMonths;
    }

    const totalAdd = adminFees + interest + autoPenalty;
    const gTotal = amount + totalAdd;
    const balance = Math.max(gTotal - remitted, 0);

    return {
        interest: Math.round(interest * 100) / 100,
        autoPenalty: Math.round(autoPenalty * 100) / 100,
        totalAdd: Math.round(totalAdd * 100) / 100,
        gTotal: Math.round(gTotal * 100) / 100,
        balance: Math.round(balance * 100) / 100
    };
}

// Keep old name for backward compatibility
function monthsOverdue(loanDate, duration) {
    return monthsOverdueSince(loanDate, duration);
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