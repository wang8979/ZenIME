const { ipcRenderer } = require('electron');

let pinyinFunc;
try {
    const { pinyin } = require('pinyin-pro');
    pinyinFunc = pinyin;
} catch (e) { }

// ================= 配置 =================
let USER_CONFIG = {
    chineseChar: "中",      
    pinyinStr: "zhong",     
    baseAlpha: 0.3,         
    color: '200, 245, 255', 
    particleSize: 2,        
    gap: 3,
    mouseRadius: 100,       
    pushForce: 2,           
    friction: 0.95,         
    returnEase: 0.02        
};

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
canvas.width = 300; canvas.height = 300;

let particles = [];
let mouse = { x: undefined, y: undefined, radius: USER_CONFIG.mouseRadius };
let isChinese = true;
let currentText = USER_CONFIG.chineseChar;

// ================= 通信与逻辑 =================

ipcRenderer.on('global-shift-pressed', () => {
    toggleIME();
});

function toggleIME() {
    isChinese = !isChinese;
    updateText();
    initParticles();
}

function hexToRgbString(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '200, 245, 255';
}
function rgbStringToHex(rgbStr) {
    const [r, g, b] = rgbStr.split(',').map(Number);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function loadConfig() {
    const saved = localStorage.getItem('zenIME_Final_Config');
    if (saved) {
        const parsed = JSON.parse(saved);
        USER_CONFIG.chineseChar = parsed.chineseChar;
        USER_CONFIG.pinyinStr = parsed.pinyinStr;
        USER_CONFIG.color = parsed.color;
    }
    const inputCn = document.getElementById('input-cn');
    const inputColor = document.getElementById('input-color');
    if(inputCn) inputCn.value = USER_CONFIG.chineseChar;
    if(inputColor) {
        try { inputColor.value = rgbStringToHex(USER_CONFIG.color); } catch(e){}
    }
    updateText();
}

window.saveAndClose = function() {
    const inputCn = document.getElementById('input-cn');
    const inputColor = document.getElementById('input-color');
    
    const newChar = inputCn.value || "中";
    const newColorHex = inputColor.value;
    
    USER_CONFIG.chineseChar = newChar;
    USER_CONFIG.color = hexToRgbString(newColorHex);
    
    if (pinyinFunc) {
        let py = pinyinFunc(newChar, { toneType: 'none', nonZh: 'consecutive' });
        USER_CONFIG.pinyinStr = py.charAt(0).toUpperCase() + py.slice(1);
    } else {
        USER_CONFIG.pinyinStr = "En";
    }

    localStorage.setItem('zenIME_Final_Config', JSON.stringify({
        chineseChar: USER_CONFIG.chineseChar,
        pinyinStr: USER_CONFIG.pinyinStr,
        color: USER_CONFIG.color
    }));

    isChinese = true; 
    toggleSettings();
    updateText();
    initParticles();
}

// 【关键修改】切换面板时，通知主进程切换“实体/鬼魂”模式
window.toggleSettings = function() {
    const panel = document.getElementById('settings-panel');
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        // 关掉面板 -> 变回鬼魂 (不抢焦点)
        ipcRenderer.send('exit-settings-mode');
    } else {
        panel.style.display = 'block';
        // 打开面板 -> 变回实体 (允许输入)
        ipcRenderer.send('enter-settings-mode');
    }
}

window.addEventListener('contextmenu', (e) => { 
    e.preventDefault(); 
    toggleSettings(); 
});

function updateText() {
    currentText = isChinese ? USER_CONFIG.chineseChar : USER_CONFIG.pinyinStr;
}

// ================= 物理引擎 =================

window.addEventListener('mousemove', (event) => {
    if(document.getElementById('settings-panel') && document.getElementById('settings-panel').style.display === 'block') {
        mouse.x = undefined; return;
    }
    mouse.x = event.x;
    mouse.y = event.y;
});
window.addEventListener('mouseout', () => { mouse.x = undefined; mouse.y = undefined; });

// 【关键修改】只响应左键点击 (button === 0)
window.addEventListener('mousedown', (e) => {
    // button: 0=左键, 1=中键, 2=右键
    if(e.button === 0) { 
        if(e.target.id === 'canvas' && document.getElementById('settings-panel').style.display !== 'block') {
            toggleIME();
        }
    }
});

class Particle {
    constructor(x, y) {
        this.originX = x; this.originY = y;
        this.x = x; this.y = y;
        this.vx = 0; this.vy = 0;
        this.size = USER_CONFIG.particleSize;
        this.floatOffset = Math.random() * 100;
    }
    draw() {
        let distHome = Math.abs(this.x - this.originX) + Math.abs(this.y - this.originY);
        let dynamicAlpha = USER_CONFIG.baseAlpha - (distHome / 200); 
        if (dynamicAlpha < 0.1) dynamicAlpha = 0; 
        ctx.fillStyle = `rgba(${USER_CONFIG.color}, ${dynamicAlpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
    }
    update() {
        let dx = mouse.x - this.x;
        let dy = mouse.y - this.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (mouse.x !== undefined && distance < mouse.radius) {
            const force = (mouse.radius - distance) / mouse.radius;
            let angle = Math.atan2(dy, dx);
            let pushX = -Math.cos(angle) * force * USER_CONFIG.pushForce;
            let pushY = -Math.sin(angle) * force * USER_CONFIG.pushForce;
            this.vx += pushX; this.vy += pushY;
        }
        if (this.x !== this.originX || this.y !== this.originY) {
            let dxHome = this.originX - this.x;
            let dyHome = this.originY - this.y;
            this.vx += dxHome * USER_CONFIG.returnEase * 0.5;
            this.vy += dyHome * USER_CONFIG.returnEase * 0.5;
        }
        this.vx *= USER_CONFIG.friction;
        this.vy *= USER_CONFIG.friction;
        if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
            this.vx += (Math.random() - 0.5) * 0.2;
            this.vy += (Math.random() - 0.5) * 0.2;
        }
        this.x += this.vx; this.y += this.vy;
        this.draw();
    }
}
function initParticles() {
    particles = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (isChinese) {
        ctx.font = 'bold 150px "Microsoft YaHei", sans-serif';
    } else {
        let len = currentText.length;
        let fontSize = len > 5 ? 50 : (len > 3 ? 60 : 70);
        ctx.font = `bold ${fontSize}px "Verdana", sans-serif`;
    }
    ctx.fillText(currentText, canvas.width/2, canvas.height/2);
    const textCoordinates = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < textCoordinates.height; y += USER_CONFIG.gap) {
        for (let x = 0; x < textCoordinates.width; x += USER_CONFIG.gap) {
            if (textCoordinates.data[(y * 4 * textCoordinates.width) + (x * 4) + 3] > 128) {
                particles.push(new Particle(x, y));
            }
        }
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
    }
    requestAnimationFrame(animate);
}

loadConfig();
initParticles();
animate();