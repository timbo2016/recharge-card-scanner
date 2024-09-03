const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const startButton = document.getElementById('startButton');
const captureButton = document.getElementById('captureButton');
const dialButton = document.getElementById('dialButton');
const clearResultsButton = document.getElementById('clearResultsButton');
const resultText = document.getElementById('resultText');
const mobileNumberInput = document.getElementById('mobileNumber');
const clearMobileButton = document.getElementById('clearMobile');
const loadingIndicator = document.getElementById('loadingIndicator');
const capturedImage = document.getElementById('capturedImage');
const cameraSelect = document.getElementById('cameraSelect');
const zoomSlider = document.getElementById('zoomSlider');
const brightnessSlider = document.getElementById('brightnessSlider');
const contrastSlider = document.getElementById('contrastSlider');

let stream = null;
let imageCapture = null;
let rechargeKey = null;

startButton.addEventListener('click', startCamera);
captureButton.addEventListener('click', captureImage);
dialButton.addEventListener('click', dialUSSD);
clearResultsButton.addEventListener('click', clearResults);
clearMobileButton.addEventListener('click', () => clearInput(mobileNumberInput));
mobileNumberInput.addEventListener('input', updateDialButtonState);
cameraSelect.addEventListener('change', switchCamera);
zoomSlider.addEventListener('input', updateCameraSettings);
brightnessSlider.addEventListener('input', updateCameraSettings);
contrastSlider.addEventListener('input', updateCameraSettings);

async function startCamera() {
    try {
        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.play();

        const track = stream.getVideoTracks()[0];
        imageCapture = new ImageCapture(track);

        startButton.disabled = true;
        captureButton.disabled = false;
        updateCameraCapabilities();

        // Enumerate devices after successfully starting the camera
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        populateCameraSelect(videoDevices);

        console.log('Camera started successfully');
    } catch (error) {
        console.error('Error starting camera:', error);
        showError(`Failed to start camera: ${error.message}. Please make sure you have granted camera permissions.`);
    }
}

function populateCameraSelect(cameras) {
    cameraSelect.innerHTML = '';
    cameras.forEach(camera => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        option.text = camera.label || `Camera ${cameraSelect.length + 1}`;
        cameraSelect.appendChild(option);
    });
}

async function switchCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    await startCamera();
}

async function updateCameraCapabilities() {
    const track = imageCapture.track;
    const capabilities = track.getCapabilities();
    const settings = track.getSettings();
    
    if ('zoom' in capabilities) {
        zoomSlider.min = capabilities.zoom.min;
        zoomSlider.max = capabilities.zoom.max;
        zoomSlider.step = capabilities.zoom.step;
        zoomSlider.value = settings.zoom;
        zoomSlider.disabled = false;
    } else {
        zoomSlider.disabled = true;
    }

    // Brightness and contrast are not typically available as camera settings
    brightnessSlider.disabled = true;
    contrastSlider.disabled = true;
}

async function updateCameraSettings() {
    const track = imageCapture.track;
    const settings = {};

    if (!track.getCapabilities().zoom) {
        zoomSlider.disabled = true;
    } else {
        settings.zoom = parseFloat(zoomSlider.value);
    }

    try {
        await track.applyConstraints({ advanced: [settings] });
    } catch (error) {
        console.error('Error applying camera settings:', error);
    }
}

async function captureImage() {
    try {
        const blob = await imageCapture.takePhoto();
        capturedImage.src = URL.createObjectURL(blob);
        capturedImage.style.display = 'block';
        capturedImage.onload = () => URL.revokeObjectURL(capturedImage.src);
        performOCR(blob);
    } catch (error) {
        console.error('Error capturing image:', error);
        showError('Failed to capture image. Please try again.');
    }
}

async function performOCR(blob) {
    resultText.textContent = 'Processing...';
    loadingIndicator.style.display = 'inline-block';
    dialButton.disabled = true;

    try {
        const result = await Tesseract.recognize(blob, 'eng', {
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
    } catch (error) {
        console.error('OCR Error:', error);
        showError('Failed to process the image. Please try again.');
        dialButton.disabled = true;
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

function extractRechargeKey(text) {
    // Adjust this regex pattern based on your specific recharge key format
    const match = text.match(/\b\d{12,16}\b/);
    return match ? match[0] : null;
}

function dialUSSD() {
    const mobileNumber = mobileNumberInput.value.trim();
    
    if (!validateInputs(rechargeKey, mobileNumber)) {
        return;
    }
    
    const ussdCode = `*121*${rechargeKey}*${mobileNumber}#`;
    console.log(`Dialing USSD code: ${ussdCode}`);
    
    window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
    resultText.textContent = `Dialing: ${ussdCode}`;
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
    
    // Validate phone number format: 077xxxxxxx or 078xxxxxxx
    const phoneNumberPattern = /^(077|078)\d{7}$/;
    if (!phoneNumberPattern.test(mobileNumber)) {
        showError('Invalid mobile number. Please enter a valid number in the format 077xxxxxxx or 078xxxxxxx.');
        return false;
    }
    
    return true;
}

function updateDialButtonState() {
    const mobileNumber = mobileNumberInput.value.trim();
    const isDialButtonEnabled = rechargeKey && mobileNumber && /^(077|078)\d{7}$/.test(mobileNumber);
    dialButton.disabled = !isDialButtonEnabled;
    console.log(`Dial button state updated: ${isDialButtonEnabled ? 'enabled' : 'disabled'}`);
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
    resultText.classList.add('error');
}

function clearInput(input) {
    input.value = '';
    updateDialButtonState();
}

function clearResults() {
    rechargeKey = null;
    resultText.textContent = '';
    dialButton.disabled = true;
    capturedImage.style.display = 'none';
    updateDialButtonState();
}

// Check for camera support when the page loads
window.addEventListener('load', checkCameraSupport);

function checkCameraSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Your browser does not support camera access. Please use a modern browser.');
        startButton.disabled = true;
    }
}

// Prevent zooming on double-tap for iOS devices
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

