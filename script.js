// Use a simple synth for sound effects
const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: {
        attack: 0.005,
        decay: 0.1,
        sustain: 0,
        release: 0.1
    }
}).toDestination();

// A noise synth for a different sound (new high score)
const newHighScoreNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: {
        attack: 0.001,
        decay: 0.2,
        sustain: 0
    }
}).toDestination();

// Sound effect for extra points
const pointSynth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: {
        attack: 0.01,
        decay: 0.05,
        sustain: 0.1,
        release: 0.1
    }
}).toDestination();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const boostTimerEl = document.getElementById('boost-timer');
const boostTimerContainer = document.getElementById('boost-timer-container');
const startText = document.getElementById('start-text');
const controlsText = document.getElementById('controls-text');
const gameOverText = document.getElementById('game-over-text');

// --- Game Constants & Global Variables ---
const GAME_STATES = {
    START: 'start',
    PLAYING: 'playing',
    GAME_OVER: 'gameOver'
};
let gameState = GAME_STATES.START;
let dino, obstacles = [], particles = [], trailParticles = [], stars = [], cityscapeLayers = [], textParticles = [], clouds = [], shootingStars = [];
let speed, score, lastTime, animationFrameId;
const groundHeight = 20;
const dinoJumpPower = -15;
const dinoGravity = 0.8;
let currentGravity = dinoGravity;
const downKeyGravityBoost = 3;
let highScore = localStorage.getItem('neonDashProHighScore') || 0;
let isBoosted = false;
let boostEndTime = 0;
let lastY = 0;

let distanceSinceLastObstacle = 0;
const OBSTACLE_SPAWN_MIN_DIST = 200;
const OBSTACLE_SPAWN_MAX_DIST = 500;
let nextObstacleDistance = 0;

let lastPowerUpTime = 0;
const POWER_UP_MIN_INTERVAL = 10000;

const OBSTACLE_TYPES = ['cactus'];

// --- Class Definitions ---
class GameObject {
    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.isHazard = true;
    }
    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.shadowBlur = 0;
    }
}

class Dino extends GameObject {
    constructor() {
        const size = 40;
        super(50, canvas.height - groundHeight - size, size, size, 'rgba(58, 77, 6, 1)');
        this.isHazard = false;
        this.dy = 0;
        this.isJumping = false;
        this.originalHeight = size;
        this.ducking = false;
        this.image = new Image();
        // You can change the image of the main block in the line belowwwww
        this.image.src = 'https://toppng.com/uploads/thumbnail/block-of-grass-from-the-game-minecraft-minecraft-grass-block-vector-11562868488whfdyakzjr.png';
        this.imageLoaded = false;
        this.imageFailed = false;
        this.image.onload = () => { this.imageLoaded = true; };
        this.image.onerror = () => { this.imageFailed = true; };
    }
    update() {
        lastY = this.y;
        this.y += this.dy;
        this.dy += currentGravity;
        if (this.y >= canvas.height - groundHeight - this.height) {
            this.y = canvas.height - groundHeight - this.height;
            this.isJumping = false;
            this.dy = 0;

            if (lastY < canvas.height - groundHeight - this.height - 5) {
                spawnLandingParticles(this.x + this.width / 2, this.y + this.height);
            }
        }
    }
    jump() {
        if (!this.isJumping) {
            this.dy = dinoJumpPower;
            this.isJumping = true;
        }
    }
    draw(ctx) {
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        if (this.imageLoaded && !this.imageFailed) {
            const yPos = this.y + (this.ducking ? this.originalHeight - this.height : 0);
            ctx.drawImage(this.image, this.x, yPos, this.width, this.height);
        } else {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
        ctx.shadowBlur = 0;
    }
}

class Cactus extends GameObject {
    constructor(x) {
        const height = Math.random() * 40 + 30;
        const width = Math.random() * 15 + 15;
        super(x, canvas.height - groundHeight - height, width, height, '#0f0');
    }
    update() { this.x -= speed; }
}

class PowerUp extends GameObject {
    constructor(x) {
        super(x, canvas.height * 0.7, 20, 20, '#0ff');
        this.isHazard = false;
    }
    update() {
        this.x -= speed;
        this.y += Math.sin(this.x / 50) * 0.5;
    }
    draw(ctx) {
        ctx.fillStyle = '#ff8c00';
        ctx.shadowColor = '#ff8c00';
        ctx.shadowBlur = 10;
        ctx.fillRect(this.x, this.y + 10, 20, 30);

        ctx.fillStyle = '#228B22';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + 10);
        ctx.lineTo(this.x + 10, this.y);
        ctx.lineTo(this.x + 20, this.y + 10);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class Particle extends GameObject {
    constructor(x, y, dx, dy, color, size) {
        super(x, y, size, size, color);
        this.dx = dx;
        this.dy = dy;
        this.alpha = 1;
    }
    update() {
        this.x += this.dx;
        this.y += this.dy;
        this.dy += 0.1;
        this.alpha -= 0.02;
    }
    draw(ctx) {
        ctx.fillStyle = `rgba(${this.color.slice(1).match(/.{2}/g).map(c=>parseInt(c,16)).join(',')}, ${this.alpha})`;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

class TrailParticle extends GameObject {
    constructor(x, y, size, color, alpha) {
        super(x, y, size, size, color);
        this.alpha = alpha;
        this.decayRate = 0.015;
    }
    update() {
        this.alpha -= this.decayRate;
        this.x -= speed * 0.7;
    }
    draw(ctx) {
        ctx.fillStyle = `rgba(${this.color.slice(1).match(/.{2}/g).map(c=>parseInt(c,16)).join(',')}, ${this.alpha})`;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

class TextParticle {
    constructor(x, y, text) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.alpha = 1;
        this.vy = -1;
    }
    update() {
        this.y += this.vy;
        this.alpha -= 0.02;
    }
    draw(ctx) {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 5;
        ctx.font = '20px Courier New';
        ctx.fillText(this.text, this.x, this.y);
        ctx.shadowBlur = 0;
    }
}

class Star {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height / 2;
        this.size = Math.random() * 2 + 1;
    }
    update() {
        this.x -= this.size * 0.1;
        if (this.x < 0) {
            this.x = canvas.width;
            this.y = Math.random() * canvas.height / 2;
        }
    }
    draw(ctx) {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.size / 3})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

class ShootingStar {
    constructor() {
        this.x = canvas.width;
        this.y = Math.random() * canvas.height * 0.5;
        this.length = Math.random() * 100 + 50;
        this.speed = Math.random() * 10 + 5;
    }
    update() {
        this.x -= this.speed * 2;
        this.y += this.speed;
    }
    draw(ctx) {
        const gradient = ctx.createLinearGradient(this.x, this.y, this.x + this.length, this.y - this.length);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.length, this.y - this.length);
        ctx.stroke();
    }
}

class CityscapeLayer {
    constructor(y, height, color, speedFactor) {
        this.y = y;
        this.height = height;
        this.color = color;
        this.speedFactor = speedFactor;
        this.buildings = [];
        this.generateBuildings(canvas.width);
    }

    generateBuildings(start_x) {
        let currentX = start_x;
        while (currentX < canvas.width * 2) {
            const buildingWidth = Math.random() * 50 + 20;
            const buildingHeight = Math.random() * this.height + 20;
            this.buildings.push({
                x: currentX,
                y: this.y - buildingHeight,
                width: buildingWidth,
                height: buildingHeight,
                windows: this.generateWindows(buildingWidth, buildingHeight)
            });
            currentX += buildingWidth + Math.random() * 30;
        }
    }

    generateWindows(buildingWidth, buildingHeight) {
        const windows = [];
        const windowSize = 5;
        const windowSpacing = 10;
        const windowColor = '#ff0';
        for (let x = windowSpacing; x < buildingWidth - windowSpacing; x += windowSize + windowSpacing) {
            for (let y = windowSpacing; y < buildingHeight - windowSpacing; y += windowSize + windowSpacing) {
                windows.push({x: x, y: y, size: windowSize, color: windowColor});
            }
        }
        return windows;
    }

    update() {
        this.buildings.forEach(b => {
            b.x -= speed * this.speedFactor;
        });
        if (this.buildings.length > 0 && this.buildings[0].x + this.buildings[0].width < 0) {
            this.buildings.shift();
            const lastBuilding = this.buildings[this.buildings.length - 1];
            const buildingWidth = Math.random() * 50 + 20;
            const buildingHeight = Math.random() * this.height + 20;
            this.buildings.push({
                x: lastBuilding.x + lastBuilding.width + Math.random() * 30,
                y: this.y - buildingHeight,
                width: buildingWidth,
                height: buildingHeight,
                windows: this.generateWindows(buildingWidth, buildingHeight)
            });
        }
    }

    draw(ctx) {
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 5;
        this.buildings.forEach(b => {
            ctx.fillStyle = this.color;
            ctx.fillRect(b.x, b.y, b.width, b.height);
            ctx.shadowColor = '#ff0';
            ctx.shadowBlur = 5;
            b.windows.forEach(w => {
                ctx.fillStyle = w.color;
                ctx.fillRect(b.x + w.x, b.y + w.y, w.size, w.size);
            });
        });
        ctx.shadowBlur = 0;
    }
}

class Cloud {
    constructor() {
        this.x = canvas.width + Math.random() * 200;
        this.y = canvas.height * 0.2 + Math.random() * canvas.height * 0.1;
        this.dx = -0.5 - Math.random() * 0.5;
        this.color = `rgba(255, 255, 255, ${0.4 + Math.random() * 0.3})`;
        this.parts = [
            {x: 0, y: 0, r: 10 + Math.random() * 5},
            {x: 15, y: 5, r: 12 + Math.random() * 5},
            {x: -5, y: 8, r: 8 + Math.random() * 5},
        ];
    }
    update() {
        this.x += this.dx;
    }
    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
        ctx.shadowBlur = 10;
        this.parts.forEach(p => {
            ctx.beginPath();
            ctx.arc(this.x + p.x, this.y + p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.shadowBlur = 0;
    }
}

// --- Game Functions ---
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (dino) {
        dino.y = canvas.height - groundHeight - dino.height;
    }
}

function initGame() {
    dino = new Dino();
    obstacles = [];
    particles = [];
    trailParticles = [];
    textParticles = [];
    stars = Array.from({length: 50}, () => new Star());
    cityscapeLayers = [
        new CityscapeLayer(canvas.height - groundHeight, 50, '#05c', 0.1),
        new CityscapeLayer(canvas.height - groundHeight, 80, '#009', 0.2),
        new CityscapeLayer(canvas.height - groundHeight, 100, '#006', 0.3)
    ];
    clouds = [];
    shootingStars = [];
    speed = 8;
    score = 0;
    scoreEl.textContent = 0;
    distanceSinceLastObstacle = 0;
    nextObstacleDistance = Math.random() * (OBSTACLE_SPAWN_MAX_DIST - OBSTACLE_SPAWN_MIN_DIST) + OBSTACLE_SPAWN_MIN_DIST;
    lastPowerUpTime = Date.now();
    isBoosted = false;
    boostTimerContainer.style.display = 'none';
    cancelAnimationFrame(animationFrameId);
    resizeCanvas();
    highScoreEl.textContent = Math.floor(highScore);
    controlsText.classList.add('visible');
}

async function startGame() {
    await Tone.start();
    gameState = GAME_STATES.PLAYING;
    startText.classList.remove('visible');
    controlsText.classList.remove('visible');
    gameOverText.classList.remove('visible');
    lastTime = performance.now();
    gameLoop(lastTime);
}

function endGame() {
    gameState = GAME_STATES.GAME_OVER;
    gameOverText.classList.add('visible');
    if (Math.floor(score) > highScore) {
        highScore = Math.floor(score);
        localStorage.setItem('neonDashProHighScore', highScore);
        highScoreEl.textContent = highScore;
        newHighScoreNoise.triggerAttackRelease('2n');
    } else {
        synth.triggerAttackRelease('C2', '8n');
    }
    cancelAnimationFrame(animationFrameId);
}

function spawnLandingParticles(x, y) {
    const numParticles = 20;
    const colors = ['#FFD700', '#FFFF00', '#FFA500']; // Yellow color palette
    for (let i = 0; i < numParticles; i++) {
        const angle = Math.random() * Math.PI;
        const speedFactor = Math.random() * 8 + 3;
        const dx = Math.cos(angle) * speedFactor;
        const dy = Math.sin(angle) * speedFactor * 0.7;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = Math.random() * 4 + 2;
        particles.push(new Particle(x, y, dx, dy, color, size));
    }
}

function gameLoop(time) {
    const deltaTime = time - lastTime;
    lastTime = time;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState === GAME_STATES.PLAYING) {
        dino.update();

        distanceSinceLastObstacle += speed;
        if (distanceSinceLastObstacle >= nextObstacleDistance) {
            spawnObstacle();
            distanceSinceLastObstacle = 0;
            nextObstacleDistance = Math.random() * (OBSTACLE_SPAWN_MAX_DIST - OBSTACLE_SPAWN_MIN_DIST) + OBSTACLE_SPAWN_MIN_DIST;
        }

        obstacles.forEach(o => o.update());
        checkCollisions();
        obstacles = obstacles.filter(o => o.x + o.width > 0);

        score += deltaTime / 1000 * (speed / 2);
        scoreEl.textContent = Math.floor(score);
        speed += 0.002;

        if (isBoosted) {
            const timeLeft = Math.max(0, Math.ceil((boostEndTime - Date.now()) / 1000));
            boostTimerEl.textContent = timeLeft;

            if (timeLeft <= 2) {
                boostTimerContainer.classList.add('warning');
            } else {
                boostTimerContainer.classList.remove('warning');
            }

            if (Date.now() > boostEndTime) {
                isBoosted = false;
                boostTimerContainer.style.display = 'none';
                boostTimerContainer.classList.remove('warning');
            }
        }

        if (Math.random() < 0.005) {
            clouds.push(new Cloud());
        }
        if (Math.random() < 0.0005) {
            shootingStars.push(new ShootingStar());
        }

        let trailSize = isBoosted ? 5 : 2;
        let trailColor = isBoosted ? `hsl(${Math.floor(time * 0.1) % 360}, 100%, 50%)` : '#f0f';
        let trailAlpha = isBoosted ? 0.7 : 0.4;
        trailParticles.push(new TrailParticle(dino.x + dino.width / 2, dino.y + dino.height / 2, trailSize, trailColor, trailAlpha));
    }

    particles = particles.filter(p => p.alpha > 0);
    trailParticles = trailParticles.filter(p => p.alpha > 0);
    textParticles = textParticles.filter(tp => tp.alpha > 0);
    clouds = clouds.filter(c => c.x + 50 > 0);
    shootingStars = shootingStars.filter(s => s.x + s.length > 0);

    particles.forEach(p => p.update());
    trailParticles.forEach(p => p.update());
    stars.forEach(s => s.update());
    cityscapeLayers.forEach(c => c.update());
    textParticles.forEach(tp => tp.update());
    clouds.forEach(c => c.update());
    shootingStars.forEach(s => s.update());

    drawBackground();
    stars.forEach(s => s.draw(ctx));
    shootingStars.forEach(s => s.draw(ctx));
    clouds.forEach(c => c.draw(ctx));
    cityscapeLayers.forEach(c => c.draw(ctx));
    drawGround();
    trailParticles.forEach(p => p.draw(ctx));
    obstacles.forEach(o => o.draw(ctx));
    dino.draw(ctx);
    particles.forEach(p => p.draw(ctx));
    textParticles.forEach(tp => tp.draw(ctx));

    animationFrameId = requestAnimationFrame(gameLoop);
}

function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#00f');
    gradient.addColorStop(1, '#005');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.arc(canvas.width - 150, 100, 70, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawGround() {
    ctx.fillStyle = '#08f';
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur = 10;
    ctx.fillRect(0, canvas.height - groundHeight, canvas.width, groundHeight);

    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 4;
    const lineGap = 40;
    const lineLength = 25;
    const lineSpeed = speed;
    const laserY = canvas.height - groundHeight * 0.75;

    for (let i = -1; i < canvas.width / lineGap + 1; i++) {
        const x = (i * lineGap + (score * lineSpeed)) % (canvas.width + lineGap);
        if (x + lineLength > 0 && x < canvas.width) {
            ctx.beginPath();
            ctx.moveTo(x, laserY);
            ctx.lineTo(x + lineLength, laserY);
            ctx.stroke();
        }
    }
}

function checkCollisions() {
    obstacles.forEach((o, index) => {
        if (
            dino.x < o.x + o.width &&
            dino.x + dino.width > o.x &&
            dino.y < o.y + o.height &&
            dino.y + dino.height > o.y
        ) {
            if (o.isHazard) {
                if (!isBoosted) {
                    endGame();
                } else {
                    obstacles.splice(index, 1);
                    score += 10;
                    textParticles.push(new TextParticle(o.x, o.y, '+10'));
                    pointSynth.triggerAttackRelease('E5', '8n');
                }
            } else {
                obstacles.splice(index, 1);
                isBoosted = true;
                boostEndTime = Date.now() + 5000;
                boostTimerContainer.style.display = 'block';
                lastPowerUpTime = Date.now();
                synth.triggerAttackRelease('A4', '8n');
            }
        }
    });
}

function spawnObstacle() {
    if (gameState !== GAME_STATES.PLAYING) return;

    const rand = Math.random();
    const timeSinceLastPowerUp = Date.now() - lastPowerUpTime;

    let newObstacle;
    if (rand < 0.1 && timeSinceLastPowerUp > POWER_UP_MIN_INTERVAL) {
        newObstacle = new PowerUp(canvas.width);
        lastPowerUpTime = Date.now();
    } else {
        newObstacle = new Cactus(canvas.width);
    }
    if (newObstacle) {
         obstacles.push(newObstacle);
    }
}

// --- Controls ---
document.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'ArrowUp') {
        if (gameState === GAME_STATES.START) {
            startGame();
        } else if (gameState === GAME_STATES.PLAYING) {
            dino.jump();
            synth.triggerAttackRelease('C4', '8n');
        } else if (gameState === GAME_STATES.GAME_OVER) {
            initGame();
            startText.classList.remove('hidden');
            startText.classList.add('visible');
            gameState = GAME_STATES.START;
        }
    } else if (e.key === 'ArrowDown') {
        if (gameState === GAME_STATES.PLAYING) {
            currentGravity = dinoGravity * downKeyGravityBoost;
        }
    }
});

document.addEventListener('keyup', e => {
    if (e.key === 'ArrowDown') {
         if (gameState === GAME_STATES.PLAYING) {
            currentGravity = dinoGravity;
        }
    }
});

window.addEventListener('resize', resizeCanvas);

window.addEventListener('load', () => {
    initGame();
    gameLoop(0);
});