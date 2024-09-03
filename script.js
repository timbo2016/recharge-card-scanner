const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const scanButton = document.getElementById('scanButton');
const dialButton = document.getElementById('dialButton');
const clearResultsButton = document.getElementById('clearResultsButton');
const resultText = document.getElementById('resultText');
const mobileNumberInput = document.getElementById('mobileNumber');
const clearMobileButton = document.getElementById('clearMobile');
const loadingIndicator = document.getElementById('loadingIndicator');

let stream = null;
let rechargeKey = null;

scanButton.addEventListener('click', startScanning);
dialButton.addEventListener('click', dialUSSD);
clearResultsButton.addEventListener('click', clearResults);
clearMobileButton.addEventListener('click', () => clearInput(mobileNumberInput));
mobileNumberInput.addEventListener('input', updateDialButtonState);

async function startScanning() {
    console.log('startScanning function called');
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
        });
        console.log('Camera access granted');
        video.srcObject = stream;
        await video.play();
        console.log('Video playback started');
        scanButton.textContent = 'Capture';
        scanButton.removeEventListener('click', startScanning);
        scanButton.addEventListener('click', captureImage);
    } catch (err) {
        console.error('Error accessing camera:', err);
        if (err.name === 'OverconstrainedError') {
            // Retry with the default camera if the preferred one is not available
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });
                video.srcObject = stream;
                await video.play();
                scanButton.textContent = 'Capture';
                scanButton.removeEventListener('click', startScanning);
                scanButton.addEventListener('click', captureImage);
            } catch (retryErr) {
                handleError('Retry Error: Camera access failed', retryErr);
            }
        } else {
            handleError('Error accessing camera', err);
        }
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
    dialButton.disabled = true;
    clearResultsButton.style.display = 'none';
    
    try {
        const result = await Tesseract.recognize(imageDataUrl, 'eng', {
            logger: m => console.log(m)
        });
        
        const text = result.data.text.trim();
        rechargeKey = extractRechargeKey(text);
        
        if (rechargeKey) {
            resultText.textContent = `Recharge Key: ${rechargeKey}`;
            updateDialButtonState();
        } else {
            resultText.textContent = 'No valid recharge key found. Please try again.';
            dialButton.disabled = true;
        }
    } catch (err) {
        handleError('OCR Error', err);
        dialButton.disabled = true;
    } finally {
        loadingIndicator.style.display = 'none';
        updateDialButtonState();
    }
}

function extractRechargeKey(text) {
    // Adjust the regex pattern based on your specific recharge key format
    const match = text.match(/\b\d{12,16}\b/);
    return match ? match[0] : null;
}

function dialUSSD() {
    const mobileNumber = mobileNumberInput.value.trim();
    
    if (!validateInputs(rechargeKey, mobileNumber)) {
        return;
    }
    
    const ussdCode = `*121*${rechargeKey}*${mobileNumber}#`;
    
    try {
        window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
        resultText.textContent = `Dialing: ${ussdCode}`;
    } catch (err) {
        handleError('Error initiating call', err);
    }
}

function validateInputs(rechargeKey, mobileNumber) {
    if (!rechargeKey) {
        showError('Please scan a recharge card first.');
        return false;
    }
    
    if (!mobileNumber) {
        showError('Please enter a mobile number.');
        return false;
    }
    
    if (!/^\d+$/.test(mobileNumber)) {
        showError('Invalid mobile number. Please enter digits only.');
        return false;
    }
    
    return true;
}

function updateDialButtonState() {
    const mobileNumber = mobileNumberInput.value.trim();
    dialButton.disabled = !(rechargeKey && mobileNumber);
    clearResultsButton.style.display = rechargeKey ? 'block' : 'none';
}

function handleError(message, error) {
    console.error(`${message}:`, error);
    let errorMessage = `${message}. `;
    if (error.name === 'NotAllowedError') {
        errorMessage += 'Camera permission was denied. Please grant camera access and try again.';
    } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera found on your device.';
    } else if (error.name === 'NotReadableError') {
        errorMessage += 'Camera is already in use by another application.';
    } else if (error.name === 'OverconstrainedError') {
        errorMessage += 'Camera does not satisfy the resolution constraints.';
    } else {
        errorMessage += `Error: ${error.message}`;
    }
    showError(errorMessage);
}

function showError(message) {
    resultText.textContent = message;
}

function clearInput(input) {
    input.value = '';
    updateDialButtonState();
}

function clearResults() {
    rechargeKey = null;
    resultText.textContent = '';
    dialButton.disabled = true;
    updateDialButtonState();
}

// Check for camera support
function checkCameraSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Your browser does not support camera access. Please use a modern browser.');
        scanButton.disabled = true;
    }
}

// Call this function when the page loads
window.addEventListener('load', checkCameraSupport);

// Add touch event listeners for better mobile interaction
scanButton.addEventListener('touchstart', function(e) {
    e.preventDefault();
    this.style.backgroundColor = '#3a7bc8';
});

scanButton.addEventListener('touchend', function(e) {
    e.preventDefault();
    this.style.backgroundColor = '';
});

dialButton.addEventListener('touchstart', function(e) {
    if (!this.disabled) {
        e.preventDefault();
        this.style.backgroundColor = '#3a7bc8';
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

// Add touch event listener for the clear results button
clearResultsButton.addEventListener('touchstart', function(e) {
    e.preventDefault();
    this.style.backgroundColor = '#d0d0d0';
});

clearResultsButton.addEventListener('touchend', function(e) {
    e.preventDefault();
    this.style.backgroundColor = '';
});
