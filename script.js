const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const scanButton = document.getElementById('scanButton');
const resultText = document.getElementById('resultText');
const mobileNumberInput = document.getElementById('mobileNumber');
const ussdPrefixInput = document.getElementById('ussdPrefix');
const dialButton = document.getElementById('dialButton');
const clearMobileButton = document.getElementById('clearMobile');
const clearUSSDButton = document.getElementById('clearUSSD');
const loadingIndicator = document.getElementById('loadingIndicator');
const historyList = document.getElementById('historyList');
const helpButton = document.getElementById('helpButton');
const helpModal = document.getElementById('helpModal');
const closeModal = document.querySelector('.close');

let stream = null;
let rechargeKey = null;

scanButton.addEventListener('click', startScanning);
dialButton.addEventListener('click', dialUSSD);
clearMobileButton.addEventListener('click', () => clearInput(mobileNumberInput));
clearUSSDButton.addEventListener('click', () => clearInput(ussdPrefixInput));
helpButton.addEventListener('click', showHelpModal);
closeModal.addEventListener('click', hideHelpModal);

async function startScanning() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        video.srcObject = stream;
        await video.play();
        scanButton.textContent = 'Capture';
        scanButton.removeEventListener('click', startScanning);
        scanButton.addEventListener('click', captureImage);
    } catch (err) {
        handleError('Error accessing camera', err);
    }
}

function captureImage() {
    try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        // Stop the video stream
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        
        scanButton.textContent = 'Scan Recharge Card';
        scanButton.removeEventListener('click', captureImage);
        scanButton.addEventListener('click', startScanning);
        
        performOCR(imageDataUrl);
    } catch (err) {
        handleError('Error capturing image', err);
    }
}

async function performOCR(imageDataUrl) {
    resultText.textContent = 'Processing...';
    loadingIndicator.style.display = 'inline-block';
    
    try {
        const result = await Tesseract.recognize(imageDataUrl, 'eng', {
            logger: m => console.log(m)
        });
        
        const text = result.data.text.trim();
        rechargeKey = extractRechargeKey(text);
        
        updateAfterOCR(!!rechargeKey);
    } catch (err) {
        handleError('OCR Error', err);
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

function extractRechargeKey(text) {
    // Adjust the regex pattern based on your specific recharge key format
    const match = text.match(/\b\d{12,16}\b/);
    return match ? match[0] : null;
}

function dialUSSD() {
    const mobileNumber = mobileNumberInput.value.trim();
    const ussdPrefix = ussdPrefixInput.value.trim();
    
    if (!validateInputs(rechargeKey, mobileNumber, ussdPrefix)) {
        return;
    }
    
    const cleanPrefix = ussdPrefix.replace(/[*#]/g, '');
    const ussdCode = `*${cleanPrefix}*${rechargeKey}*${mobileNumber}#`;
    
    try {
        window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
        resultText.textContent = `Dialing: ${ussdCode}`;
        rechargeKey = null;
        dialButton.disabled = true;
    } catch (err) {
        handleError('Error initiating call', err);
    }
}

function validateInputs(rechargeKey, mobileNumber, ussdPrefix) {
    if (!rechargeKey) {
        showError('Please scan a recharge card first.');
        return false;
    }
    
    if (!mobileNumber) {
        showError('Please enter a mobile number.');
        return false;
    }
    
    if (!ussdPrefix) {
        showError('Please enter a USSD prefix.');
        return false;
    }
    
    if (!/^\d+$/.test(mobileNumber)) {
        showError('Invalid mobile number. Please enter digits only.');
        return false;
    }
    
    if (!/^\d+$/.test(ussdPrefix.replace(/[*#]/g, ''))) {
        showError('Invalid USSD prefix. Please enter digits only, optionally starting with *.');
        return false;
    }
    
    return true;
}

function updateDialButtonState() {
    const mobileNumber = mobileNumberInput.value.trim();
    const ussdPrefix = ussdPrefixInput.value.trim();
    dialButton.disabled = !(rechargeKey && mobileNumber && ussdPrefix);
}

function updateAfterOCR(success) {
    if (success) {
        resultText.textContent = `Recharge Key: ${rechargeKey}`;
        resultText.classList.add('success');
        addToHistory(rechargeKey);
    } else {
        showError('No valid recharge key found. Please try again.');
        rechargeKey = null;
    }
    updateDialButtonState();
}

function addToHistory(key) {
    const li = document.createElement('li');
    li.textContent = key;
    historyList.prepend(li);
    
    // Keep only the last 5 items
    while (historyList.children.length > 5) {
        historyList.removeChild(historyList.lastChild);
    }
}

function handleError(message, error) {
    console.error(`${message}:`, error);
    showError(`${message}. Please try again.`);
    updateDialButtonState();
}

function showError(message) {
    resultText.textContent = message;
    resultText.classList.remove('success');
    resultText.classList.add('error');
    setTimeout(() => {
        resultText.classList.remove('error');
    }, 3000);
}

function clearInput(input) {
    input.value = '';
    updateDialButtonState();
}

function showHelpModal() {
    helpModal.style.display = 'block';
}

function hideHelpModal() {
    helpModal.style.display = 'none';
}

// Close the modal when clicking outside of it
window.onclick = function(event) {
    if (event.target == helpModal) {
        hideHelpModal();
    }
}

// Add touch event listeners for better mobile interaction
scanButton.addEventListener('touchstart', function(e) {
    e.preventDefault();
    this.style.backgroundColor = '#45a049';
});

scanButton.addEventListener('touchend', function(e) {
    e.preventDefault();
    this.style.backgroundColor = '';
});

dialButton.addEventListener('touchstart', function(e) {
    if (!this.disabled) {
        e.preventDefault();
        this.style.backgroundColor = '#45a049';
    }
});

dialButton.addEventListener('touchend', function(e) {
    if (!this.disabled) {
        e.preventDefault();
        this.style.backgroundColor = '';
    }
});

// Prevent zooming on double-tap for iOS devices
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => console.log('ServiceWorker registered'))
            .catch(err => console.log('ServiceWorker registration failed: ', err));
    });
}
