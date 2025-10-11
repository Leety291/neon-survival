const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- UI & DOM Elements ---
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const uiContainer = document.getElementById('ui-container');
const lobbyModal = document.getElementById('lobby-modal');
const gameOverModal = document.getElementById('game-over-modal');
const startGameBtn = document.getElementById('start-game-btn');
const restartGameBtn = document.getElementById('restart-game-btn');
const waveDisplay = document.getElementById('wave-display');

const towerHpEl = document.getElementById('tower-hp');
const playerHpEl = document.getElementById('player-hp');
const waveEl = document.getElementById('wave');
const xpEl = document.getElementById('xp');
const shopModal = document.getElementById('shop-modal');
const shopTimerEl = document.getElementById('shop-timer');
const upgradeTowerHpBtn = document.getElementById('upgrade-tower-hp');
const addSentryBtn = document.getElementById('add-sentry');
const rouletteStartBtn = document.getElementById('roulette-start-btn');
const closeShopBtn = document.getElementById('close-shop');
const skillSlots = { q: document.getElementById('skill-q'), e: document.getElementById('skill-e'), r: document.getElementById('skill-r') };
const rouletteModal = document.getElementById('roulette-modal');

// --- Audio ---
const bgm = new Audio('bgm.mp3');
bgm.loop = true;
bgm.volume = 0.4;

// --- Game Objects & State ---
const keys = { w: false, a: false, s: false, d: false, ' ': false, q: false, e: false, r: false, mouse0: false };
const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

let projectiles, enemies, particles, experienceOrbs, sentries;
let score, wave, enemiesToSpawn, spawnTimer;
let gameState, previousGameState, waveClearTimer, shopPhaseTimer;
let player, tower;
let animationId;

// --- Drawing ---
function drawBackgroundGrid() {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke(); }
    for (let i = 0; i < canvas.height; i += 50) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke(); }
}

function showWaveAnnouncer(text) {
    waveDisplay.textContent = text;
    waveDisplay.classList.add('visible');
    setTimeout(() => {
        waveDisplay.classList.remove('visible');
    }, 2000);
}

// --- Utility Classes ---
class Projectile {
    constructor(x, y, radius, color, velocity, damage = 10, pierceCount = 0, isExplosive = false) {
        this.x = x; this.y = y; this.radius = radius; this.color = color; this.velocity = velocity; this.damage = damage; this.pierceCount = pierceCount; this.isExplosive = isExplosive;
    }
    draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.fill(); }
    update() { this.draw(); this.x += this.velocity.x; this.y += this.velocity.y; }
}

class Particle {
    constructor(x, y, radius, color, velocity) { this.x = x; this.y = y; this.radius = radius; this.color = color; this.velocity = velocity; this.alpha = 1; }
    draw() { ctx.save(); ctx.globalAlpha = this.alpha; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.fill(); ctx.restore(); }
    update() { this.draw(); this.velocity.x *= 0.99; this.velocity.y *= 0.99; this.x += this.velocity.x; this.y += this.velocity.y; this.alpha -= 0.02; }
}

class ExperienceOrb {
    constructor(x, y, radius, color, value) { this.x = x; this.y = y; this.radius = radius; this.color = color; this.value = value; }
    draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.fill(); }
    update() { this.draw(); }
}

// --- Game Character Classes ---
class Player {
    constructor(x, y, color, speed) {
        this.x = x; this.y = y; this.color = color; this.maxSpeed = speed;
        this.width = 20; this.height = 30; this.angle = 0;
        this.velocityX = 0; this.velocityY = 0;
        this.acceleration = 0.3; this.friction = 0.97;
        this.health = 100; this.maxHealth = 100;
        this.shootCooldown = 12; this.shootTimer = 0;
        this.abilities = [];
        this.skills = [];
        this.skillCooldowns = { nova: 300, blink: 400, barrier: 600, overdrive: 1200 };
        this.skillTimers = {};
        this.skillDurations = {};
        this.activeEffects = {};
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(0, -this.height / 2);
        ctx.lineTo(-this.width / 2, this.height / 2);
        ctx.lineTo(this.width / 2, this.height / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        if (this.activeEffects['barrier']) {
            ctx.save();
            ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 100) * 0.2;
            ctx.fillStyle = '#00FFFF';
            ctx.shadowColor = '#00FFFF';
            ctx.shadowBlur = 25;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width * 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    shoot() {
        if (this.shootTimer <= 0) {
            const projectileSpeed = 7;
            const baseVelocity = { x: Math.sin(this.angle) * projectileSpeed, y: -Math.cos(this.angle) * projectileSpeed };
            let pierceCount = this.abilities.includes('piercing') ? 2 : 0;
            let isExplosive = this.abilities.includes('explosive');
            projectiles.push(new Projectile(this.x, this.y, 5, '#00BFFF', baseVelocity, 10, pierceCount, isExplosive));
            if (this.abilities.includes('multishot')) {
                const angle1 = this.angle - 0.2; const angle2 = this.angle + 0.2;
                const vel1 = { x: Math.sin(angle1) * projectileSpeed, y: -Math.cos(angle1) * projectileSpeed };
                const vel2 = { x: Math.sin(angle2) * projectileSpeed, y: -Math.cos(angle2) * projectileSpeed };
                projectiles.push(new Projectile(this.x, this.y, 4, '#00BFFF', vel1, 5, pierceCount, isExplosive));
                projectiles.push(new Projectile(this.x, this.y, 4, '#00BFFF', vel2, 5, pierceCount, isExplosive));
            }
            this.shootTimer = this.shootCooldown;
        }
    }

    activateSkill(skillId) {
        if (!skillId || (this.skillTimers[skillId] && this.skillTimers[skillId] > 0)) return;
        switch (skillId) {
            case 'nova':
                const pCount = 16; for (let i = 0; i < pCount; i++) { const a = (i / pCount) * Math.PI * 2; const v = { x: Math.cos(a) * 5, y: Math.sin(a) * 5 }; projectiles.push(new Projectile(this.x, this.y, 6, '#FFD700', v, 20)); }
                break;
            case 'blink':
                const dist = 150;
                const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
                this.x += Math.cos(angle) * dist;
                this.y += Math.sin(angle) * dist;
                break;
            case 'barrier':
                this.activeEffects['barrier'] = true; this.skillDurations['barrier'] = 180;
                break;
            case 'overdrive':
                this.activeEffects['overdrive'] = true; this.skillDurations['overdrive'] = 300;
                break;
        }
        this.skillTimers[skillId] = this.skillCooldowns[skillId];
    }

    update() {
        this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x) + Math.PI / 2;
        if (this.shootTimer > 0) this.shootTimer--;
        for (const skillId in this.skillTimers) { if (this.skillTimers[skillId] > 0) this.skillTimers[skillId]--; }
        for (const effectId in this.skillDurations) { if (this.skillDurations[effectId] > 0) { this.skillDurations[effectId]--; } else { this.activeEffects[effectId] = false; } }

        if (keys.w) this.velocityY -= this.acceleration; if (keys.s) this.velocityY += this.acceleration; if (keys.a) this.velocityX -= this.acceleration; if (keys.d) this.velocityX += this.acceleration;
        this.velocityX *= this.friction; this.velocityY *= this.friction;
        const speed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY); if (speed > this.maxSpeed) { this.velocityX = (this.velocityX / speed) * this.maxSpeed; this.velocityY = (this.velocityY / speed) * this.maxSpeed; }
        this.x += this.velocityX; this.y += this.velocityY;

        if (keys[' '] || keys.mouse0) this.shoot();
        if (keys.q) this.activateSkill(this.skills[0]);
        if (keys.e) this.activateSkill(this.skills[1]);
        if (keys.r) this.activateSkill(this.skills[2]);
        
        if (this.x - this.width / 2 < 0) { this.x = this.width / 2; this.velocityX = 0; }
        if (this.x + this.width / 2 > canvas.width) { this.x = canvas.width - this.width / 2; this.velocityX = 0; }
        if (this.y - this.height / 2 < 0) { this.y = this.height / 2; this.velocityY = 0; }
        if (this.y + this.height / 2 > canvas.height) { this.y = canvas.height - this.height / 2; this.velocityY = 0; }

        this.draw();
    }
}

class Tower {
    constructor(x, y, size, color) { this.x = x; this.y = y; this.size = size; this.color = color; this.health = 1000; this.maxHealth = 1000; }
    draw() { ctx.fillStyle = this.color; ctx.strokeStyle = '#FFF'; ctx.lineWidth = 3; ctx.shadowColor = this.color; ctx.shadowBlur = 20; ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size); ctx.strokeRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size); }
}

class Sentry {
    constructor(x, y) { this.x = x; this.y = y; this.radius = 10; this.color = '#00FFFF'; this.originalCooldown = 40; this.shootCooldown = 40; this.shootTimer = 0; this.range = 250; }
    draw() { ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); }
    update() { this.draw(); if (this.shootTimer > 0) this.shootTimer--; this.shootCooldown = player.activeEffects['overdrive'] ? this.originalCooldown / 2 : this.originalCooldown; let closestEnemy = null, minDistance = this.range; enemies.forEach(enemy => { if(enemy instanceof LaserEnemy && enemy.state !== 'moving') return; const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y); if (dist < minDistance) { minDistance = dist; closestEnemy = enemy; } }); if (closestEnemy && this.shootTimer <= 0) { const angle = Math.atan2(closestEnemy.y - this.y, closestEnemy.x - this.x); const velocity = { x: Math.cos(angle) * 6, y: Math.sin(angle) * 6 }; projectiles.push(new Projectile(this.x, this.y, 4, this.color, velocity, 5)); this.shootTimer = this.shootCooldown; } }
}

class Enemy {
    constructor(x, y, radius, color, speed, health, xpValue) { this.x = x; this.y = y; this.radius = radius; this.color = color; this.originalSpeed = speed; this.speed = speed; this.health = health; this.maxHealth = health; this.xpValue = xpValue; this.target = null; this.attackCooldown = 60; this.attackTimer = 0; }
    draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.fill(); }
    update() { if (this.attackTimer > 0) this.attackTimer--; const distPlayer = Math.hypot(player.x - this.x, player.y - this.y); const distTower = Math.hypot(tower.x - this.x, tower.y - this.y); this.target = (distPlayer < distTower && distPlayer < 800) ? player : tower; const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x); this.x += Math.cos(angle) * this.speed; this.y += Math.sin(angle) * this.speed; this.draw(); }
}

class TriangleEnemy extends Enemy {
    constructor(x, y) { super(x, y, 20, '#FF0000', 1.2, 30, 10); this.dashCooldown = 180; this.dashTimer = Math.random() * 180; }
    draw() { ctx.save(); ctx.translate(this.x, this.y); const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x); ctx.rotate(angle + Math.PI / 2); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.beginPath(); ctx.moveTo(0, -this.radius); ctx.lineTo(-this.radius, this.radius); ctx.lineTo(this.radius, this.radius); ctx.closePath(); ctx.fill(); ctx.restore(); }
    update() { super.update(); this.dashTimer++; if (this.target) { const distTarget = Math.hypot(this.target.x - this.x, this.target.y - this.y); if (this.dashTimer > this.dashCooldown && distTarget < 250) { this.speed = 4; setTimeout(() => { this.speed = this.originalSpeed; }, 150); this.dashTimer = 0; } } }
}

class SquareEnemy extends Enemy {
    constructor(x, y) { super(x, y, 25, '#FF4500', 0.8, 60, 20); }
    draw() { ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2); }
}

class ChristmasTreeEnemy extends Enemy {
    constructor(x, y) { super(x, y, 22, '#FFFF00', 1, 40, 30); this.initialCooldown = 300 + Math.random() * 120; this.teleportTimer = 0; this.hasTeleported = false; }
    draw() { ctx.save(); ctx.translate(this.x, this.y); const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x); ctx.rotate(angle + Math.PI / 2); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.beginPath(); ctx.moveTo(0, -this.radius); ctx.lineTo(-this.radius, 0); ctx.lineTo(this.radius, 0); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-this.radius * 0.8, this.radius); ctx.lineTo(this.radius * 0.8, this.radius); ctx.closePath(); ctx.fill(); ctx.restore(); }
    teleport() { if (!this.target) return; const behindDist = 80; const angleToTarget = Math.atan2(this.y - this.target.y, this.x - this.target.x); this.x = this.target.x + Math.cos(angleToTarget) * behindDist; this.y = this.target.y + Math.sin(angleToTarget) * behindDist; }
    update() { super.update(); this.teleportTimer++; if (!this.hasTeleported && this.teleportTimer >= this.initialCooldown) { this.teleport(); this.hasTeleported = true; this.teleportTimer = 0; } else if (this.hasTeleported && this.teleportTimer >= 240) { this.teleport(); this.teleportTimer = 0; } }
}

class TinyTriangleEnemy extends Enemy {
    constructor(x, y) { super(x, y, 8, '#FF69B4', 2.5, 5, 1); }
    draw() { ctx.save(); ctx.translate(this.x, this.y); const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x); ctx.rotate(angle + Math.PI / 2); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(0, -this.radius); ctx.lineTo(-this.radius, this.radius); ctx.lineTo(this.radius, this.radius); ctx.closePath(); ctx.fill(); ctx.restore(); }
}

class HealerEnemy extends Enemy {
    constructor(x, y) { super(x, y, 20, '#00FF7F', 0.7, 50, 25); this.healCooldown = 180; this.healTimer = 0; this.healRadius = 150; }
    draw() { super.draw(); ctx.strokeStyle = '#FFF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(this.x - this.radius / 2, this.y); ctx.lineTo(this.x + this.radius / 2, this.y); ctx.moveTo(this.x, this.y - this.radius / 2); ctx.lineTo(this.x, this.y + this.radius / 2); ctx.stroke(); }
    update() { super.update(); this.healTimer++; if (this.healTimer >= this.healCooldown) { enemies.forEach(e => { if (e !== this) { const dist = Math.hypot(this.x - e.x, this.y - e.y); if (dist < this.healRadius) { e.health = Math.min(e.maxHealth, e.health + 10); } } }); this.healTimer = 0; } }
}

class SummonerEnemy extends Enemy {
    constructor(x, y) { super(x, y, 30, '#9400D3', 0.5, 80, 40); this.summonCooldown = 300; this.summonTimer = 0; }
    draw() { ctx.save(); ctx.translate(this.x, this.y); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.beginPath(); for (let i = 0; i < 5; i++) { ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * this.radius, -Math.sin((18 + i * 72) * Math.PI / 180) * this.radius); } ctx.closePath(); ctx.fill(); ctx.restore(); }
    update() { super.update(); this.summonTimer++; if (this.summonTimer >= this.summonCooldown) { enemies.push(new TinyTriangleEnemy(this.x, this.y)); enemies.push(new TinyTriangleEnemy(this.x, this.y)); this.summonTimer = 0; } }
}

class LaserEnemy extends Enemy {
    constructor(x, y) { super(x, y, 18, '#FFFFFF', 1, 40, 50); this.state = 'moving'; this.aimDuration = 120; this.fireDuration = 20; this.aimTimer = 0; this.laserTarget = {}; }
    draw() { ctx.save(); ctx.translate(this.x, this.y); const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x); ctx.rotate(angle); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.beginPath(); ctx.moveTo(0, -this.radius); ctx.lineTo(this.radius, 0); ctx.lineTo(0, this.radius); ctx.lineTo(-this.radius, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
    update() {
        if (this.attackTimer > 0) this.attackTimer--;
        if (this.state === 'moving') { super.update(); if (this.attackTimer <= 0) { this.state = 'aiming'; this.aimTimer = this.aimDuration; this.laserTarget = { x: player.x, y: player.y }; } } 
        else if (this.state === 'aiming') {
            this.draw(); this.aimTimer--;
            ctx.save(); ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; ctx.lineWidth = 1; ctx.setLineDash([15, 5]); ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.laserTarget.x, this.laserTarget.y); ctx.stroke(); ctx.restore();
            if (this.aimTimer <= 0) { this.state = 'firing'; this.aimTimer = this.fireDuration; const angle = Math.atan2(this.laserTarget.y - this.y, this.laserTarget.x - this.x); for (let i = 0; i < 30; i++) { const vel = { x: Math.cos(angle) * 20, y: Math.sin(angle) * 20 }; projectiles.push(new Projectile(this.x + vel.x / 20 * i * 2, this.y + vel.y / 20 * i * 2, 5, 'red', vel, 2, 100)); } }
        } else if (this.state === 'firing') {
            this.draw(); this.aimTimer--;
            if (this.aimTimer <= 0) { this.state = 'moving'; this.attackTimer = this.attackCooldown * 3; }
        }
    }
}

const waveConfig = [ { triangle: 5, square: 0, tree: 0 }, { triangle: 8, square: 2, tree: 0 }, { triangle: 10, square: 5, tree: 1 }, { triangle: 0, square: 10, tree: 3 }, { triangle: 15, square: 8, tree: 5 }, { triangle: 12, square: 10, tree: 3, healer: 1 }, { triangle: 15, square: 5, tree: 5, summoner: 1 }, { triangle: 10, square: 10, tree: 2, laser: 2 }, { triangle: 0, square: 0, tree: 0, healer: 3, summoner: 2, laser: 3 }, { triangle: 20, square: 15, tree: 8, healer: 2, summoner: 2, laser: 2 } ];

function startWave() { wave++; waveEl.textContent = wave; showWaveAnnouncer(`WAVE ${wave}`); gameState = 'WAVE_IN_PROGRESS'; const currentWave = waveConfig[wave - 1] || { triangle: 10 + wave, square: 5 + wave, tree: 3 + wave, healer: Math.max(0, wave - 5), summoner: Math.max(0, wave - 6), laser: Math.max(0, wave - 7) }; enemiesToSpawn = []; for (let i = 0; i < (currentWave.triangle || 0); i++) enemiesToSpawn.push('triangle'); for (let i = 0; i < (currentWave.square || 0); i++) enemiesToSpawn.push('square'); for (let i = 0; i < (currentWave.tree || 0); i++) enemiesToSpawn.push('tree'); for (let i = 0; i < (currentWave.healer || 0); i++) enemiesToSpawn.push('healer'); for (let i = 0; i < (currentWave.summoner || 0); i++) enemiesToSpawn.push('summoner'); for (let i = 0; i < (currentWave.laser || 0); i++) enemiesToSpawn.push('laser'); enemiesToSpawn.sort(() => Math.random() - 0.5); rouletteStartBtn.disabled = false; spawnTimer = 0; }

const upgradePool = [
    { id: 'heal', name: '체력 50 회복', description: '즉시 플레이어의 체력을 50 회복합니다.', apply: (p) => { p.health = Math.min(p.maxHealth, p.health + 50); } },
    { id: 'speed', name: '이동 속도 증가', description: '플레이어의 최대 이동 속도가 영구적으로 증가합니다.', apply: (p) => { p.maxSpeed += 0.5; } },
    { id: 'firerate', name: '공격 속도 증가', description: '기본 공격의 발사 속도가 영구적으로 증가합니다.', apply: (p) => { p.shootCooldown = Math.max(5, p.shootCooldown * 0.85); } },
    { id: 'nova', name: '전방위 사격', description: '[Q,E,R] 키로 주변의 모든 적에게 피해를 줍니다.', type: 'skill', apply: (p) => { if (p.skills.length < 3 && !p.skills.includes('nova')) { p.skills.push('nova'); p.skillTimers['nova'] = 0; } } },
    { id: 'blink', name: '점멸', description: '[Q,E,R] 키로 짧은 거리를 순간이동합니다.', type: 'skill', apply: (p) => { if (p.skills.length < 3 && !p.skills.includes('blink')) { p.skills.push('blink'); p.skillTimers['blink'] = 0; } } },
    { id: 'barrier', name: '에너지 방벽', description: '[Q,E,R] 키로 잠시동안 방어막을 생성합니다.', type: 'skill', apply: (p) => { if (p.skills.length < 3 && !p.skills.includes('barrier')) { p.skills.push('barrier'); p.skillTimers['barrier'] = 0; } } },
    { id: 'overdrive', name: '포탑 과부하', description: '[Q,E,R] 키로 모든 포탑의 공격 속도를 잠시 증가시킵니다.', type: 'skill', apply: (p) => { if (p.skills.length < 3 && !p.skills.includes('overdrive')) { p.skills.push('overdrive'); p.skillTimers['overdrive'] = 0; } } },
    { id: 'piercing', name: '관통탄', description: '기본 총알이 2명의 적을 추가로 관통합니다.', type: 'ability', apply: (p) => { if (!p.abilities.includes('piercing')) p.abilities.push('piercing'); } },
    { id: 'multishot', name: '다중 발사', description: '기본 공격 시 3방향으로 총알을 발사합니다.', type: 'ability', apply: (p) => { if (!p.abilities.includes('multishot')) p.abilities.push('multishot'); } },
    { id: 'explosive', name: '폭발탄', description: '총알이 적에게 닿으면 폭발하여 주변에 피해를 줍니다.', type: 'ability', apply: (p) => { if (!p.abilities.includes('explosive')) p.abilities.push('explosive'); } },
];

function presentRouletteOptions() { const availableUpgrades = upgradePool.filter(upg => { if (upg.type === 'skill' && player.skills.length >= 3) return false; if (upg.type === 'skill' && player.skills.includes(upg.id)) return false; if (upg.type === 'ability' && player.abilities.includes(upg.id)) return false; return true; }); const chosenUpgrades = availableUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3); for (let i = 0; i < 3; i++) { const optionEl = document.getElementById(`option-${i}`); const titleEl = optionEl.querySelector('.option-title'); const descEl = optionEl.querySelector('.option-desc'); const btnEl = optionEl.querySelector('.select-option-btn'); if (chosenUpgrades[i]) { const upgrade = chosenUpgrades[i]; titleEl.textContent = upgrade.name; descEl.textContent = upgrade.description; const newBtn = btnEl.cloneNode(true); btnEl.parentNode.replaceChild(newBtn, btnEl); newBtn.onclick = () => { upgrade.apply(player); rouletteModal.classList.add('hidden'); }; optionEl.style.display = 'flex'; } else { optionEl.style.display = 'none'; } } rouletteModal.classList.remove('hidden'); }

// --- Game Flow & State Management ---
function resetGame() {
    if (animationId) cancelAnimationFrame(animationId);
    projectiles = []; enemies = []; particles = []; experienceOrbs = []; sentries = [];
    score = 0; wave = 0;
    gameState = 'LOBBY';
    player = new Player(canvas.width / 2 + 100, canvas.height / 2, '#00BFFF', 3);
    tower = new Tower(canvas.width / 2, canvas.height / 2, 70, '#FF4500');
    Object.values(skillSlots).forEach(slot => { slot.style.borderColor = '#fff'; slot.style.boxShadow = '0 0 8px #fff'; slot.style.opacity = 0.4; slot.innerHTML = slot.id.slice(-1).toUpperCase(); });
}

function initGame() {
    resetGame();
    uiContainer.classList.remove('hidden');
    canvas.classList.remove('hidden');
    gameState = 'START';
    bgm.play();
    animate();
}

function animate() {
    animationId = requestAnimationFrame(animate);
    if (gameState === 'PAUSED') {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '50px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
        ctx.restore();
        return;
    }

    ctx.fillStyle = '#222'; ctx.fillRect(0, 0, canvas.width, canvas.height); drawBackgroundGrid();
    ctx.fillStyle = 'rgba(34, 34, 34, 0.1)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    tower.draw();
    sentries.forEach(s => s.update());
    if (gameState !== 'GAME_OVER') player.update(); else player.draw();
    particles.forEach((p, i) => { if (p.alpha <= 0) particles.splice(i, 1); else p.update(); });
    projectiles.forEach((p, i) => { if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) projectiles.splice(i, 1); else p.update(); });
    experienceOrbs.forEach((orb, i) => { orb.update(); const dist = Math.hypot(player.x - orb.x, player.y - orb.y); if (dist < player.width / 2 + orb.radius + 50) { score += orb.value; experienceOrbs.splice(i, 1); } });
    if (gameState !== 'SHOP_PHASE') enemies.forEach(e => e.update()); else enemies.forEach(e => e.draw());

    if (gameState === 'WAVE_IN_PROGRESS') {
        if (enemiesToSpawn.length > 0) {
            spawnTimer = (spawnTimer || 0) + 1;
            if (spawnTimer >= 100) {
                const enemyType = enemiesToSpawn.pop(); let x, y; const radius = 20;
                if (Math.random() < 0.5) { x = Math.random() < 0.5 ? 0 - radius : canvas.width + radius; y = Math.random() * canvas.height; } else { x = Math.random() * canvas.width; y = Math.random() < 0.5 ? 0 - radius : canvas.height + radius; }
                if (enemyType === 'triangle') enemies.push(new TriangleEnemy(x, y));
                if (enemyType === 'square') enemies.push(new SquareEnemy(x, y));
                if (enemyType === 'tree') enemies.push(new ChristmasTreeEnemy(x, y));
                if (enemyType === 'healer') enemies.push(new HealerEnemy(x, y));
                if (enemyType === 'summoner') enemies.push(new SummonerEnemy(x, y));
                if (enemyType === 'laser') enemies.push(new LaserEnemy(x, y));
                spawnTimer = 0;
            }
        } else if (enemies.length === 0) { gameState = 'WAVE_CLEAR'; waveClearTimer = 180; showWaveAnnouncer('WAVE CLEAR'); }
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            const distTower = Math.hypot(tower.x - enemy.x, tower.y - enemy.y); if (distTower - enemy.radius - tower.size / 2 < 1) { if(enemy.attackTimer <= 0){ tower.health -= 10; enemy.attackTimer = enemy.attackCooldown; } }
            const distPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y); if (distPlayer - enemy.radius - player.width / 2 < 1) { if(enemy.attackTimer <= 0){ player.health -= 10; enemy.attackTimer = enemy.attackCooldown; } }
            if (player.activeEffects['barrier']) { const distBarrier = Math.hypot(player.x - enemy.x, player.y - enemy.y); if (distBarrier < player.width * 2.5 + enemy.radius) { enemy.health -= 0.5; } }
            for (let j = projectiles.length - 1; j >= 0; j--) {
                const projectile = projectiles[j];
                if (!projectile || !enemy) continue;
                const dist = Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y);
                if (dist - enemy.radius - projectile.radius < 1) {
                    if (projectile.isExplosive) { for (let k = 0; k < 10; k++) { particles.push(new Particle(projectile.x, projectile.y, Math.random() * 3, 'orange', { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 })); } enemies.forEach(expEnemy => { if(expEnemy !== enemy) { const expDist = Math.hypot(projectile.x - expEnemy.x, projectile.y - expEnemy.y); if (expDist < 50) { expEnemy.health -= 5; } } }); }
                    enemy.health -= projectile.damage;
                    if (projectile.pierceCount > 0) { projectile.pierceCount--; } else { projectiles.splice(j, 1); }
                    if (enemy.health <= 0) {
                        if (enemy instanceof SquareEnemy) { enemies.push(new TinyTriangleEnemy(enemy.x, enemy.y)); }
                        experienceOrbs.push(new ExperienceOrb(enemy.x, enemy.y, 5, '#00FF00', enemy.xpValue));
                        enemies.splice(i, 1);
                        break;
                    }
                }
            }
        }
    } else if (gameState === 'WAVE_CLEAR') { waveClearTimer--; if (waveClearTimer <= 0) { gameState = 'SHOP_PHASE'; shopPhaseTimer = 600; } } else if (gameState === 'SHOP_PHASE') { if(wave > 0) { showWaveAnnouncer('상점 시간 - 타워 우클릭'); wave = -wave; } if (shopModal.classList.contains('hidden') && rouletteModal.classList.contains('hidden')) { shopPhaseTimer--; } shopTimerEl.textContent = Math.ceil(shopPhaseTimer / 60); if (shopPhaseTimer <= 0) { shopModal.classList.add('hidden'); rouletteModal.classList.add('hidden'); gameState = 'START'; } } else if (gameState === 'START') { startWave(); } 
    if ((player.health <= 0 || tower.health <= 0) && gameState !== 'GAME_OVER') { gameState = 'GAME_OVER'; }
    if(gameState === 'GAME_OVER') { uiContainer.classList.add('hidden'); canvas.classList.add('hidden'); gameOverModal.classList.remove('hidden'); bgm.pause(); bgm.currentTime = 0; cancelAnimationFrame(animationId); return; }
    playerHpEl.textContent = player.health; towerHpEl.textContent = tower.health; xpEl.textContent = score;
    const skillKeys = ['q', 'e', 'r']; const skillColors = { nova: '#FFD700', blink: '#00FFFF', barrier: '#FF00FF', overdrive: '#FFA500' };
    skillKeys.forEach((key, i) => { const skillId = player.skills[i]; if (skillId) { skillSlots[key].style.borderColor = skillColors[skillId]; skillSlots[key].style.opacity = 1 - (player.skillTimers[skillId] / player.skillCooldowns[skillId]); skillSlots[key].innerHTML = `<b>${skillId.charAt(0).toUpperCase()}</b>`; } else { skillSlots[key].style.borderColor = '#fff'; skillSlots[key].style.opacity = 0.4; skillSlots[key].innerHTML = key.toUpperCase(); } });
}

// --- Event Listeners ---
startGameBtn.addEventListener('click', () => { lobbyModal.classList.add('hidden'); initGame(); });
restartGameBtn.addEventListener('click', () => { gameOverModal.classList.add('hidden'); lobbyModal.classList.remove('hidden'); });
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('keydown', (e) => { const key = e.key.toLowerCase(); if (key in keys) keys[key] = true; if (key === 'escape') { if (gameState === 'PAUSED') { gameState = previousGameState; } else if (gameState !== 'LOBBY' && gameState !== 'GAME_OVER') { previousGameState = gameState; gameState = 'PAUSED'; } } });
window.addEventListener('keyup', (e) => { const key = e.key.toLowerCase(); if (key in keys) keys[key] = false; });
window.addEventListener('mousedown', e => { if (e.button === 0) keys.mouse0 = true; });
window.addEventListener('mouseup', e => { if (e.button === 0) keys.mouse0 = false; });
window.addEventListener('contextmenu', e => { e.preventDefault(); if (gameState === 'SHOP_PHASE') { const dist = Math.hypot(e.clientX - tower.x, e.clientY - tower.y); if (dist < tower.size) { shopModal.classList.remove('hidden'); rouletteStartBtn.disabled = false; } } });
closeShopBtn.addEventListener('click', () => { shopModal.classList.add('hidden'); });
upgradeTowerHpBtn.addEventListener('click', () => { const cost = 100; if (score >= cost) { score -= cost; tower.maxHealth += 200; tower.health = tower.maxHealth; } });
addSentryBtn.addEventListener('click', () => { const cost = 250; if (score >= cost) { score -= cost; const angle = Math.random() * Math.PI * 2; const dist = tower.size / 2 + Math.random() * 30; sentries.push(new Sentry(tower.x + Math.cos(angle) * dist, tower.y + Math.sin(angle) * dist)); } });
rouletteStartBtn.addEventListener('click', () => { const cost = 200; if (score >= cost) { score -= cost; shopModal.classList.add('hidden'); presentRouletteOptions(); } });
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; tower.x = canvas.width / 2; tower.y = canvas.height / 2; if(player) { player.x = canvas.width/2 + 100; player.y = canvas.height/2; } });

// --- Initial call ---
resetGame();
lobbyModal.classList.remove('hidden');
uiContainer.classList.add('hidden');
canvas.classList.add('hidden');