const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- UI & DOM Elements ---
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const uiContainer = document.getElementById('ui-container');
const lobbyModal = document.getElementById('lobby-modal');
const gameOverModal = document.getElementById('game-over-modal');
const controlsModal = document.getElementById('controls-modal');
const codexModal = document.getElementById('codex-modal');

const startGameBtn = document.getElementById('start-game-btn');
const restartGameBtn = document.getElementById('restart-game-btn');
const controlsBtn = document.getElementById('controls-btn');
const resetHighScoreBtn = document.getElementById('reset-highscore-btn');
let closeControlsBtn = null;
if (controlsModal) {
    closeControlsBtn = controlsModal.querySelector('.close-btn');
}
const codexBtn = document.getElementById('codex-btn');
let closeCodexBtn = null;
if (codexModal) {
    closeCodexBtn = codexModal.querySelector('.close-btn');
}

const waveDisplay = document.getElementById('wave-display');
const highScoreDisplayEl = document.getElementById('high-score-display');
const highScoreEl = document.getElementById('high-score');
const currentScoreEl = document.getElementById('current-score');
const enemyCountEl = document.getElementById('enemy-count');

const towerHpEl = document.getElementById('tower-hp');
const playerHpEl = document.getElementById('player-hp');
const waveEl = document.getElementById('wave');
const xpEl = document.getElementById('xp');
const shopModal = document.getElementById('shop-modal');
const shopTimerEl = document.getElementById('shop-timer');
const closeShopBtn = shopModal.querySelector('.close-btn');
const skillSlots = { q: document.getElementById('skill-q'), e: document.getElementById('skill-e'), r: document.getElementById('skill-r') };
const rouletteModal = document.getElementById('roulette-modal');
const codexEnemiesDiv = document.getElementById('codex-enemies');
const codexPlayerUpgradesDiv = document.getElementById('codex-player-upgrades');

// --- Audio ---
const bgm = new Audio('bgm.mp3');
bgm.loop = true;
bgm.volume = 0.4;

// --- Game Objects & State ---
const keys = { w: false, a: false, s: false, d: false, ' ': false, q: false, e: false, r: false, mouse0: false };
const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

let projectiles, enemies, particles, experienceOrbs, sentries;
let score, wave, enemiesToSpawn, spawnTimer, gameTime;
let gameState, previousGameState, waveClearTimer, shopPhaseTimer, shopAnnounced;
let player, tower;
let animationId;
let shopCosts = {};
let currentBoss = null;

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
    constructor(x, y, radius, color, velocity, damage = 10, pierceCount = 0, isExplosive = false, isContinuousExplosive = false) {
        this.x = x; this.y = y; this.radius = radius; this.color = color; this.velocity = velocity; this.damage = damage; this.pierceCount = pierceCount; this.isExplosive = isExplosive; this.isContinuousExplosive = isContinuousExplosive;
        this.enemiesHitThisFrame = new Set(); // Add this line
    }
    draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.fill(); }
    update() {
        this.draw();
        this.x += this.velocity.x;
        this.y += this.velocity.y;

        if (this.isContinuousExplosive) {
            // Spawn small particles continuously
            particles.push(new Particle(this.x, this.y, Math.random() * 2 + 1, 'red', { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 }));
        }
    }
}

class DiamondProjectile extends Projectile {
    constructor(x, y, radius, color, velocity, damage = 10, pierceCount = 0, isExplosive = false, isContinuousExplosive = false) {
        super(x, y, radius, color, velocity, damage, pierceCount, isExplosive, isContinuousExplosive);
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        // Calculate angle based on velocity to make the diamond point in direction of travel
        const angle = Math.atan2(this.velocity.y, this.velocity.x);
        ctx.rotate(angle);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(0, -this.radius);
        ctx.lineTo(this.radius, 0);
        ctx.lineTo(0, this.radius);
        ctx.lineTo(-this.radius, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, radius, color, velocity) { this.x = x; this.y = y; this.radius = radius; this.color = color; this.velocity = velocity; this.alpha = 1; }
    draw() { ctx.save(); ctx.globalAlpha = this.alpha; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.fill(); ctx.restore(); }
    update() { this.draw(); this.velocity.x *= 0.99; this.velocity.y *= 0.99; this.x += this.velocity.x; this.y += this.velocityY; this.alpha -= 0.02; }
}

class ExperienceOrb {
    constructor(x, y, radius, color, value) { this.x = x; this.y = y; this.radius = radius; this.color = color; this.value = value; }
    draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.fill(); }
    update() { this.draw(); }
}

// --- Game Character Classes ---
class Player {
    constructor(x, y, color, speed) {
        this.x = x; this.y = y; this.color = color; this.maxSpeed = 3.0;
        this.width = 25; this.height = 37; this.angle = 0;
        this.velocityX = 0; this.velocityY = 0;
        this.acceleration = 0.35; // Reverted
        this.friction = 0.97;
        this.health = 100; this.maxHealth = 100;
        this.shootCooldown = 20; // Reverted
        this.shootTimer = 0;
        this.abilities = [];
        this.skills = []; // Reverted: Blink is no longer a default skill
        this.skillCooldowns = { nova: 300, blink: 400, barrier: 600, overdrive: 1200 }; // Reverted
        this.skillTimers = {};
        this.skillDurations = {};
        this.activeEffects = {};
        this.state = 'ALIVE';
        this.reviveTimer = 0;
        this.invincibleTimer = 0;
        this.speedUpgradesCount = 0;
        this.firerateUpgradesCount = 0;
        this.damageMultiplier = 1;
        this.damageUpgradesCount = 0;
        this.multishotUpgradesCount = 0;
    }

    draw() {
        if (this.state === 'DEAD') return;
        ctx.save();
        if (this.invincibleTimer > 0) {
            ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 50) * 0.5;
        }
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
            const projectileSpeed = 7; // Reverted further
            const baseAngle = this.angle;
            const spread = 0.25;
            let isExplosive = this.abilities.includes('explosive');
            let pierceCount = 0;

            const projectileCount = this.multishotUpgradesCount + 1;

            if (projectileCount === 1) {
                const vel = { x: Math.sin(baseAngle) * projectileSpeed, y: -Math.cos(baseAngle) * projectileSpeed };
                projectiles.push(new Projectile(this.x, this.y, 5, '#00BFFF', vel, 10 * this.damageMultiplier, pierceCount, isExplosive));
            } else if (projectileCount === 2) {
                const angle1 = baseAngle - spread / 2;
                const angle2 = baseAngle + spread / 2;
                const vel1 = { x: Math.sin(angle1) * projectileSpeed, y: -Math.cos(angle1) * projectileSpeed };
                const vel2 = { x: Math.sin(angle2) * projectileSpeed, y: -Math.cos(angle2) * projectileSpeed };
                projectiles.push(new Projectile(this.x, this.y, 4, '#00BFFF', vel1, 8 * this.damageMultiplier, pierceCount, isExplosive));
                projectiles.push(new Projectile(this.x, this.y, 4, '#00BFFF', vel2, 8 * this.damageMultiplier, pierceCount, isExplosive));
            } else if (projectileCount >= 3) {
                const angle1 = baseAngle - spread;
                const angle2 = baseAngle + spread;
                const velCenter = { x: Math.sin(baseAngle) * projectileSpeed, y: -Math.cos(baseAngle) * projectileSpeed };
                const vel1 = { x: Math.sin(angle1) * projectileSpeed, y: -Math.cos(angle1) * projectileSpeed };
                const vel2 = { x: Math.sin(angle2) * projectileSpeed, y: -Math.cos(angle2) * projectileSpeed };
                projectiles.push(new Projectile(this.x, this.y, 5, '#00BFFF', velCenter, 10 * this.damageMultiplier, pierceCount, isExplosive));
                projectiles.push(new Projectile(this.x, this.y, 4, '#00BFFF', vel1, 5 * this.damageMultiplier, pierceCount, isExplosive));
                projectiles.push(new Projectile(this.x, this.y, 4, '#00BFFF', vel2, 5 * this.damageMultiplier, pierceCount, isExplosive));
            }

            this.shootTimer = this.shootCooldown;
        }
    }

    activateSkill(skillId) {
        if (!skillId || (this.skillTimers[skillId] && this.skillTimers[skillId] > 0)) return;
        switch (skillId) {
            case 'nova':
                const pCount = 16; for (let i = 0; i < pCount; i++) { const a = (i / pCount) * Math.PI * 2; const v = { x: Math.cos(a) * 6, y: Math.sin(a) * 6 }; projectiles.push(new Projectile(this.x, this.y, 6, '#FFD700', v, 20)); }
                break;
            case 'blink':
                const dist = 200;
                const angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
                const startX = this.x;
                const startY = this.y;
                const endX = this.x + Math.cos(angle) * dist;
                const endY = this.y + Math.sin(angle) * dist;

                const blinkDamage = 50;
                const blinkWidth = this.width * 1.5;

                for (let i = enemies.length - 1; i >= 0; i--) {
                    const enemy = enemies[i];
                    const dx = endX - startX;
                    const dy = endY - startY;
                    const lenSq = dx * dx + dy * dy;
                    const t = Math.max(0, Math.min(1, ((enemy.x - startX) * dx + (enemy.y - startY) * dy) / lenSq));
                    const closestX = startX + t * dx;
                    const closestY = startY + t * dy;
                    const distSq = (enemy.x - closestX) ** 2 + (enemy.y - closestY) ** 2;

                    if (distSq < (enemy.radius + blinkWidth / 2) ** 2) {
                        enemy.health -= blinkDamage;
                        for (let k = 0; k < 5; k++) {
                            particles.push(new Particle(enemy.x, enemy.y, Math.random() * 3, '#00FFFF', { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 }));
                        }
                    }
                }

                for (let i = 0; i < 10; i++) {
                    const pathProgress = i / 9;
                    const particleX = startX + (endX - startX) * pathProgress;
                    const particleY = startY + (endY - startY) * pathProgress;
                    particles.push(new Particle(particleX, particleY, Math.random() * 2 + 1, '#00FFFF', { x: 0, y: 0 }));
                }

                this.x = endX;
                this.y = endY;
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
        if (this.state === 'DEAD') {
            this.reviveTimer--;
            if (this.reviveTimer <= 0) {
                this.state = 'ALIVE';
                this.health = this.maxHealth;
                this.invincibleTimer = 180;
            }
            return;
        }

        if (this.invincibleTimer > 0) this.invincibleTimer--;
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

        // Tower collision
        const distTowerPlayer = Math.hypot(this.x - tower.x, this.y - tower.y);
        const playerCollisionRadius = this.width / 2; // Approximation for the player triangle
        const towerCollisionRadius = tower.size / 2;

        if (distTowerPlayer < playerCollisionRadius + towerCollisionRadius) {
            const angle = Math.atan2(this.y - tower.y, this.x - tower.x);
            const overlap = (playerCollisionRadius + towerCollisionRadius) - distTowerPlayer;
            this.x += Math.cos(angle) * overlap;
            this.y += Math.sin(angle) * overlap;
        }

        this.draw();
    }
}

class Tower {
    constructor(x, y, size, color) { this.x = x; this.y = y; this.size = size; this.color = color; this.health = 500; this.maxHealth = 500; }
    draw() { ctx.fillStyle = this.color; ctx.strokeStyle = '#FFF'; ctx.lineWidth = 3; ctx.shadowColor = this.color; ctx.shadowBlur = 20; ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size); ctx.strokeRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size); }
}

class Sentry {
    constructor(x, y) { this.x = x; this.y = y; this.radius = 12; this.color = '#00FFFF'; this.originalCooldown = 40; this.shootCooldown = 40; this.shootTimer = 0; this.range = 250; } // Reverted cooldown
    draw() { ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); }
    update() { this.draw(); if (this.shootTimer > 0) this.shootTimer--; this.shootCooldown = player.activeEffects['overdrive'] ? this.originalCooldown / 2 : this.originalCooldown; let closestEnemy = null, minDistance = this.range; enemies.forEach(enemy => { if(enemy instanceof LaserEnemy && enemy.state !== 'moving') return; const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y); if (dist < minDistance) { minDistance = dist; closestEnemy = enemy; } }); if (closestEnemy && this.shootTimer <= 0) { const angle = Math.atan2(closestEnemy.y - this.y, closestEnemy.x - this.x); const velocity = { x: Math.cos(angle) * 5, y: Math.sin(angle) * 5 }; projectiles.push(new Projectile(this.x, this.y, 4, this.color, velocity, 5)); this.shootTimer = this.shootCooldown; } }
}

class Enemy {
    constructor(x, y, radius, color, speed, health, xpValue, damage = 10) { this.x = x; this.y = y; this.radius = radius; this.color = color; this.originalSpeed = speed; this.speed = speed; this.health = health; this.maxHealth = health; this.xpValue = xpValue; this.target = null; this.attackCooldown = 60; this.attackTimer = 0; this.damage = damage; } // Reverted attack cooldown
    draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.fill(); }
    update() { if (this.attackTimer > 0) this.attackTimer--; const distPlayer = Math.hypot(player.x - this.x, player.y - this.y); const distTower = Math.hypot(tower.x - this.x, tower.y - this.y); this.target = (distPlayer < distTower && player.state === 'ALIVE') ? player : tower; const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x); this.x += Math.cos(angle) * this.speed; this.y += Math.sin(angle) * this.speed; this.draw(); }
}

class TriangleEnemy extends Enemy {
    constructor(x, y, xpValue = 10) { super(x, y, 25, '#FF0000', 1.4, 44, xpValue, 15); this.dashCooldown = 180; this.dashTimer = Math.random() * 180; } // Speed reduced
    draw() { ctx.save(); ctx.translate(this.x, this.y); const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x); ctx.rotate(angle + Math.PI / 2); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.beginPath(); ctx.moveTo(0, -this.radius); ctx.lineTo(-this.radius, this.radius); ctx.lineTo(this.radius, this.radius); ctx.closePath(); ctx.fill(); ctx.restore(); }
    update() { super.update(); this.dashTimer++; if (this.target) { const distTarget = Math.hypot(this.target.x - this.x, this.target.y - this.y); if (this.dashTimer > this.dashCooldown && distTarget < 250) { this.speed = 3.2; setTimeout(() => { this.speed = this.originalSpeed; }, 150); this.dashTimer = 0; } } } // Dash speed reduced
}

class SquareEnemy extends Enemy {
    constructor(x, y) { super(x, y, 31, '#FF4500', 1.0, 60, 20, 15); } // Speed reduced
    draw() { ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2); }
    update() { 
        if (this.attackTimer > 0) this.attackTimer--; 
        this.target = tower; // Always target the tower
                const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        
                const oldX = this.x;
                const oldY = this.y;
        
                this.x += Math.cos(angle) * this.speed; 
                this.y += Math.sin(angle) * this.speed; 
        
                // Tower collision
                const distTowerEnemy = Math.hypot(this.x - tower.x, this.y - tower.y);
                const enemyCollisionRadius = this.radius;
                const towerCollisionRadius = tower.size / 2;
        
                if (distTowerEnemy < enemyCollisionRadius + towerCollisionRadius) {
                    this.x = oldX;
                    this.y = oldY;
                }
        
                this.draw(); 
    }
}

class ChristmasTreeEnemy extends Enemy {
    constructor(x, y) { super(x, y, 27, '#FFFF00', 1.2, 90, 30, 22); this.initialCooldown = 120 + Math.random() * 180; this.teleportTimer = 0; this.hasTeleported = false; this.alpha = 1; this.teleportState = 'none'; } // Speed reduced
    draw() { ctx.save(); ctx.globalAlpha = this.alpha; ctx.translate(this.x, this.y); const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x); ctx.rotate(angle + Math.PI / 2); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.beginPath(); ctx.moveTo(0, -this.radius); ctx.lineTo(-this.radius, 0); ctx.lineTo(this.radius, 0); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-this.radius * 0.8, this.radius); ctx.lineTo(this.radius * 0.8, this.radius); ctx.closePath(); ctx.fill(); ctx.restore(); }
    teleport() { 
        if (!this.target) return;
        const behindDist = 100; // Increased distance slightly for better positioning

        if (this.target === player && player.state === 'ALIVE') {
            // Angle from player to mouse (where player is looking)
            const lookAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
            // Angle directly behind the player's look direction
            const behindAngle = lookAngle + Math.PI;
            // New position is 'behindDist' away from the player at the 'behindAngle'
            this.x = player.x + Math.cos(behindAngle) * behindDist;
            this.y = player.y + Math.sin(behindAngle) * behindDist;
        } else {
            // Keep original behavior if target is the tower or player is dead
            const angleToTarget = Math.atan2(this.y - this.target.y, this.x - this.target.x);
            this.x = this.target.x + Math.cos(angleToTarget) * behindDist;
            this.y = this.target.y + Math.sin(angleToTarget) * behindDist;
        }
    }
    update() {
        if (this.teleportState === 'fadingOut') {
            this.alpha -= 0.05;
            if (this.alpha <= 0) { this.teleport(); this.teleportState = 'fadingIn'; }
        } else if (this.teleportState === 'fadingIn') {
            this.alpha += 0.05;
            if (this.alpha >= 1) { this.alpha = 1; this.teleportState = 'none'; }
        } else {
            if (this.attackTimer > 0) this.attackTimer--;
            this.target = (player.state === 'ALIVE') ? player : tower;

            if (this.target && this.target.state === 'ALIVE') {
                const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                const oldX = this.x;
                const oldY = this.y;
                this.x += Math.cos(angle) * this.speed;
                this.y += Math.sin(angle) * this.speed;

                // Tower collision
                const distTowerEnemy = Math.hypot(this.x - tower.x, this.y - tower.y);
                const enemyCollisionRadius = this.radius;
                const towerCollisionRadius = tower.size / 2;

                if (distTowerEnemy < enemyCollisionRadius + towerCollisionRadius) {
                    this.x = oldX;
                    this.y = oldY;
                }
            }

            this.teleportTimer++;
            if (!this.hasTeleported && this.teleportTimer >= this.initialCooldown) { this.teleportState = 'fadingOut'; this.hasTeleported = true; this.teleportTimer = 0; } 
        }
        this.draw();
    }
}

class TinyTriangleEnemy extends Enemy {
    constructor(x, y) { super(x, y, 10, '#FF69B4', 2.8, 8, 1, 15); } // Speed reduced
    draw() { ctx.save(); ctx.translate(this.x, this.y); const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x); ctx.rotate(angle + Math.PI / 2); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(0, -this.radius); ctx.lineTo(-this.radius, this.radius); ctx.lineTo(this.radius, this.radius); ctx.closePath(); ctx.fill(); ctx.restore(); }
}

class HealerEnemy extends Enemy {
    constructor(x, y) { super(x, y, 25, '#00FF7F', 0.9, 74, 25, 15); this.healCooldown = 180; this.healTimer = 0; this.healRadius = 150; } // Speed reduced
    draw() { 
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        const barWidth = this.radius * 1.5;
        const barHeight = this.radius / 2;
        ctx.fillRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight);
        ctx.fillRect(-barHeight / 2, -barWidth / 2, barHeight, barWidth);
        ctx.restore();
    }
    update() { super.update(); this.healTimer++; if (this.healTimer >= this.healCooldown) { enemies.forEach(e => { if (e !== this) { const dist = Math.hypot(this.x - e.x, this.y - e.y); if (dist < this.healRadius) { e.health = Math.min(e.maxHealth, e.health + 10); } } }); this.healTimer = 0; } }
}

class SummonerEnemy extends Enemy {
    constructor(x, y) { super(x, y, 37, '#9400D3', 0.8, 120, 40, 15); this.summonCooldown = 180; this.summonTimer = 0; } // Speed reduced
    draw() { ctx.save(); ctx.translate(this.x, this.y); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.beginPath(); for (let i = 0; i < 5; i++) { ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * this.radius, -Math.sin((18 + i * 72) * Math.PI / 180) * this.radius); } ctx.closePath(); ctx.fill(); ctx.restore(); }
    update() { super.update(); this.summonTimer++; if (this.summonTimer >= this.summonCooldown) { enemies.push(new TinyTriangleEnemy(this.x, this.y)); enemies.push(new TinyTriangleEnemy(this.x, this.y)); this.summonTimer = 0; } }
}

class LaserEnemy extends Enemy {
    constructor(x, y) { super(x, y, 22, '#FFFFFF', 1.2, 333, 50, 15); this.state = 'moving'; this.aimDuration = 45; this.fireDuration = 1; this.aimTimer = 0; this.laserTarget = {}; this.consecutiveShots = 0; this.maxConsecutiveShots = 1; } // Speed reduced
    draw() { ctx.save(); ctx.translate(this.x, this.y); const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x); ctx.rotate(angle); ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.beginPath(); ctx.moveTo(0, -this.radius); ctx.lineTo(this.radius, 0); ctx.lineTo(0, this.radius); ctx.lineTo(-this.radius, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
    update() {
        if (this.attackTimer > 0) this.attackTimer--;

        if (this.state === 'moving') {
            // Always target the player, unless they are dead
            this.target = (player.state === 'ALIVE') ? player : tower;
            if (this.target && this.target.state === 'ALIVE') {
                const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                const oldX = this.x;
                const oldY = this.y;
                this.x += Math.cos(angle) * this.speed;
                this.y += Math.sin(angle) * this.speed;

                // Tower collision
                const distTowerEnemy = Math.hypot(this.x - tower.x, this.y - tower.y);
                const enemyCollisionRadius = this.radius;
                const towerCollisionRadius = tower.size / 2;
                if (distTowerEnemy < enemyCollisionRadius + towerCollisionRadius) {
                    this.x = oldX;
                    this.y = oldY;
                }
            }
            
            if (this.attackTimer <= 0) {
                this.state = 'aiming';
                this.aimTimer = this.aimDuration;
                this.laserTarget = { x: player.x, y: player.y };
            }
        } 
        else if (this.state === 'aiming') {
            this.aimTimer--;
            // Draw aiming line
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([15, 5]);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.laserTarget.x, this.laserTarget.y);
            ctx.stroke();
            ctx.restore();

            if (this.aimTimer <= 0) { // After delay, fire
                const projectileSpeed = 15; // Reverted
                const angle = Math.atan2(this.laserTarget.y - this.y, this.laserTarget.x - this.x);
                const vel = { x: Math.cos(angle) * projectileSpeed, y: Math.sin(angle) * projectileSpeed };
                
                const laserProjectile = new DiamondProjectile(this.x, this.y, 10, 'red', vel, 20, 0, true, false);
                laserProjectile.isFromLaserEnemy = true; // Keep this for the tower collision
                laserProjectile.owner = this; // Set the owner to prevent self-collision
                projectiles.push(laserProjectile);

                this.state = 'moving';
                this.attackTimer = this.attackCooldown * 3; // Cooldown adjusted
            }
        }
        this.draw();
    }
}

class HexagonEnemy extends Enemy {
    constructor(x, y) { super(x, y, 29, '#8A2BE2', 0.6, 150, 60, 15); this.summonCooldown = 240; this.summonTimer = 0; } // Speed reduced
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            ctx.lineTo(Math.cos(i * Math.PI / 3) * this.radius, Math.sin(i * Math.PI / 3) * this.radius);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    update() {
        super.update();
        this.summonTimer++;
        if (this.summonTimer >= this.summonCooldown) {
            enemies.push(new LaserEnemy(this.x + (Math.random() - 0.5) * 50, this.y + (Math.random() - 0.5) * 50));
            this.summonTimer = 0;
        }
    }
}

class BlinkingEnemy extends Enemy {
    constructor(x, y) {
        super(x, y, 30, '#FF1493', 1.0, 100, 70, 30);
        this.state = 'moving'; // moving, telegraphing, blinking
        this.blinkCooldown = 300;
        this.blinkTimer = Math.random() * 300;
        this.telegraphDuration = 60;
        this.telegraphTimer = 0;
        this.blinkPath = {};
        this.blinkSpeed = 12;
    }

    draw() {
        if (this.state === 'telegraphing') {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = 'red';
            ctx.shadowColor = 'red';
            ctx.shadowBlur = 15;
            const { startX, startY, endX, endY, width } = this.blinkPath;
            const angle = Math.atan2(endY - startY, endX - startX);
            ctx.translate(startX, startY);
            ctx.rotate(angle);
            const length = Math.hypot(endX - startX, endY - startY);
            ctx.fillRect(0, -width / 2, length, width);
            ctx.restore();
        }

        ctx.save();
        ctx.globalAlpha = this.state === 'blinking' ? 0.5 : 1;
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.fillRect(this.x - this.radius / 2, this.y - this.radius / 2, this.radius, this.radius);
        ctx.restore();
    }

    update() {
        if (this.attackTimer > 0) this.attackTimer--;
        this.blinkTimer++;

        if (this.state === 'moving') {
            this.target = (player.state === 'ALIVE') ? player : tower;
            const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            this.x += Math.cos(angle) * this.speed;
            this.y += Math.sin(angle) * this.speed;

            if (this.blinkTimer > this.blinkCooldown) {
                this.state = 'telegraphing';
                this.telegraphTimer = this.telegraphDuration;
                const blinkDist = 350;
                const targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
                this.blinkPath = {
                    startX: this.x,
                    startY: this.y,
                    endX: this.x + Math.cos(targetAngle) * blinkDist,
                    endY: this.y + Math.sin(targetAngle) * blinkDist,
                    width: this.radius * 1.5
                };
            }
        } else if (this.state === 'telegraphing') {
            this.telegraphTimer--;
            if (this.telegraphTimer <= 0) {
                this.state = 'blinking';
            }
        } else if (this.state === 'blinking') {
            const { endX, endY } = this.blinkPath;
            const angle = Math.atan2(endY - this.y, endX - this.x);
            const moveX = Math.cos(angle) * this.blinkSpeed;
            const moveY = Math.sin(angle) * this.blinkSpeed;
            this.x += moveX;
            this.y += moveY;

            // Damage on path
            [player, tower].forEach(target => {
                const dist = Math.hypot(this.x - target.x, this.y - target.y);
                const targetRadius = target === player ? player.width / 2 : tower.size / 2;
                if (dist < this.radius / 2 + targetRadius) {
                    if (target.invincibleTimer <= 0) {
                         target.health -= this.damage;
                         if(target === player) {
                            target.health = Math.max(0, target.health);
                            player.invincibleTimer = 30;
                         }
                    }
                }
            });

            if (Math.hypot(this.x - endX, this.y - endY) < this.blinkSpeed) {
                this.state = 'moving';
                this.blinkTimer = 0;
                triggerScreenShake(10, 5);
            }
        }
        this.draw();
    }
}

class BoomerangProjectile extends Projectile {
    constructor(x, y, owner, target) {
        super(x, y, 15, '#DAA520', { x: 0, y: 0 }, 25);
        this.owner = owner;
        this.state = 'out'; // out, in
        this.rotation = 0;
        this.hitTargets = new Set();
        this.t = 0; // Parameter for Bezier curve

        const travelDist = 400;
        const curveAmount = 150;
        const angle = Math.atan2(target.y - y, target.x - x);

        this.startX = x;
        this.startY = y;

        this.endX = this.startX + Math.cos(angle) * travelDist;
        this.endY = this.startY + Math.sin(angle) * travelDist;

        // Control point is perpendicular to the main travel line
        const midX = this.startX + (this.endX - this.startX) / 2;
        const midY = this.startY + (this.endY - this.startY) / 2;
        this.controlX = midX + Math.cos(angle - Math.PI / 2) * curveAmount;
        this.controlY = midY + Math.sin(angle - Math.PI / 2) * curveAmount;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(0, -this.radius);
        ctx.lineTo(this.radius, 0);
        ctx.lineTo(0, this.radius / 2);
        ctx.lineTo(-this.radius, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    update() {
        this.rotation += 0.4; // Faster rotation

        if (this.state === 'out') {
            this.t += 0.02;
            if (this.t > 1) {
                this.t = 1;
                this.state = 'in';
            }
            // Quadratic Bezier curve formula
            const oneMinusT = 1 - this.t;
            this.x = oneMinusT * oneMinusT * this.startX + 2 * oneMinusT * this.t * this.controlX + this.t * this.t * this.endX;
            this.y = oneMinusT * oneMinusT * this.startY + 2 * oneMinusT * this.t * this.controlY + this.t * this.t * this.endY;

        } else { // state === 'in'
            const returnSpeed = 10;
            const angle = Math.atan2(this.owner.y - this.y, this.owner.x - this.x);
            this.x += Math.cos(angle) * returnSpeed;
            this.y += Math.sin(angle) * returnSpeed;

            if (Math.hypot(this.x - this.owner.x, this.y - this.owner.y) < this.radius) {
                const index = projectiles.findIndex(p => p === this);
                if (index > -1) projectiles.splice(index, 1);
            }
        }

        // Check collision with player
        const distPlayer = Math.hypot(this.x - player.x, this.y - player.y);
        if (!this.hitTargets.has(player) && distPlayer < this.radius + player.width / 2) {
            if (player.invincibleTimer <= 0) {
                player.health -= this.damage;
                player.health = Math.max(0, player.health);
                this.hitTargets.add(player);
            }
        }
        this.draw();
    }
}

class BoomerangEnemy extends Enemy {
    constructor(x, y) {
        super(x, y, 28, '#8B4513', 1.4, 120, 80, 20);
        this.throwCooldown = 240;
        this.throwTimer = Math.random() * 240;
        this.idealDistance = 300;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            ctx.lineTo(Math.cos(i * 2 * Math.PI / 5) * this.radius, Math.sin(i * 2 * Math.PI / 5) * this.radius);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    update() {
        if (this.attackTimer > 0) this.attackTimer--;
        this.throwTimer++;

        this.target = (player.state === 'ALIVE') ? player : tower;
        const distToTarget = Math.hypot(this.target.y - this.y, this.target.x - this.x);
        const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);

        // Try to maintain ideal distance
        if (distToTarget > this.idealDistance + 50) {
            this.x += Math.cos(angle) * this.speed;
            this.y += Math.sin(angle) * this.speed;
        } else if (distToTarget < this.idealDistance - 50) {
            this.x -= Math.cos(angle) * this.speed;
            this.y -= Math.sin(angle) * this.speed;
        }

        if (this.throwTimer > this.throwCooldown) {
            projectiles.push(new BoomerangProjectile(this.x, this.y, this, this.target));
            this.throwTimer = 0;
        }

        this.draw();
    }
}


const waveConfig = [
    { triangle: 5, square: 0, tree: 0 }, // Wave 1
    { triangle: 8, square: 2, tree: 0 }, // Wave 2
    { triangle: 2, square: 2, tree: 2, boomerang: 1, tinyTriangle: 3, blinking: 2 }, // Wave 3
    { laser: 5, blinking: 2, square: 2, healer: 3 }, // Wave 4
    { triangle: 10, square: 8, tree: 3, healer: 1, summoner: 1, boomerang: 2 }, // Wave 5
    { triangle: 12, square: 5, tree: 4, summoner: 1, healer: 1, laser: 1, blinking: 3 }, // Wave 6
    { triangle: 8, square: 8, tree: 3, laser: 3, hexagon: 1, healer: 1, boomerang: 3 }, // Wave 7
    { triangle: 10, healer: 2, summoner: 2, laser: 3, hexagon: 1, blinking: 4 }, // Wave 8
    { triangle: 15, square: 10, tree: 5, healer: 3, summoner: 3, laser: 4, hexagon: 2, boomerang: 4, blinking: 4 } // Wave 9
];

function startWave() {
    wave++;
    waveEl.textContent = wave;
    showWaveAnnouncer(`WAVE ${wave}`);
    gameState = 'WAVE_IN_PROGRESS';

    currentBoss = null; // Ensure no boss
    const bossHealthBar = document.getElementById('boss-health-bar');
    if (bossHealthBar) {
        bossHealthBar.classList.add('hidden');
    }

    const currentWave = waveConfig[wave - 1] || { triangle: 10 + Math.floor(wave * 1.5), square: 5 + wave, tree: 2 + Math.floor(wave / 2), healer: Math.max(0, Math.floor(wave / 2) - 1), summoner: Math.max(0, Math.floor(wave / 3) - 1), laser: Math.max(0, Math.floor(wave / 4) - 1), hexagon: Math.max(0, Math.floor(wave / 5) - 1), boomerang: Math.max(0, Math.floor(wave/4)-1), blinking: Math.max(0, Math.floor(wave/5)-1) };
    enemiesToSpawn = [];
    for (let i = 0; i < (currentWave.triangle || 0); i++) enemiesToSpawn.push('triangle');
    for (let i = 0; i < (currentWave.square || 0); i++) enemiesToSpawn.push('square');
    for (let i = 0; i < (currentWave.tinyTriangle || 0); i++) enemiesToSpawn.push('tinyTriangle');
    for (let i = 0; i < (currentWave.tree || 0); i++) enemiesToSpawn.push('tree');
    for (let i = 0; i < (currentWave.healer || 0); i++) enemiesToSpawn.push('healer');
    for (let i = 0; i < (currentWave.summoner || 0); i++) enemiesToSpawn.push('summoner');
    for (let i = 0; i < (currentWave.laser || 0); i++) enemiesToSpawn.push('laser');
    for (let i = 0; i < (currentWave.hexagon || 0); i++) enemiesToSpawn.push('hexagon');
    for (let i = 0; i < (currentWave.blinking || 0); i++) enemiesToSpawn.push('blinking');
    for (let i = 0; i < (currentWave.boomerang || 0); i++) enemiesToSpawn.push('boomerang');
    enemiesToSpawn.sort(() => Math.random() - 0.5);

    spawnTimer = 0;
    shopAnnounced = false;
}

const shopUpgradePool = [
    // Tower Upgrades
    { id: 'towerHealth', name: '타워 체력 +250', description: '타워의 최대 체력과 현재 체력을 250 늘립니다.', type: 'tower', cost: 100, costIncrease: 100, apply: () => { tower.maxHealth = Math.min(700, tower.maxHealth + 250); tower.health = Math.min(tower.health + 250, tower.maxHealth); } },
    { id: 'addSentry', name: '보초 추가', description: '타워를 방어하는 자동 포탑을 추가합니다.', type: 'tower', cost: 150, costIncrease: 75, apply: () => { const angle = Math.random() * Math.PI * 2; const dist = tower.size / 2 + Math.random() * 30; sentries.push(new Sentry(tower.x + Math.cos(angle) * dist, tower.y + Math.sin(angle) * dist)); } },
    // Player Upgrades
    { id: 'playerHealth', name: '체력 50 회복', description: '즉시 플레이어의 체력을 50 회복합니다.', type: 'player', cost: 50, costIncrease: 0, apply: (p) => { p.health = Math.min(p.maxHealth, p.health + 50); } },
    { id: 'speed', name: '이동 속도 증가', description: '플레이어의 최대 이동 속도가 영구적으로 증가합니다.', type: 'player', cost: 150, costIncrease: 50, maxStacks: 5, apply: (p) => { p.maxSpeed += 0.5; p.speedUpgradesCount++; } },
    { id: 'firerate', name: '공격 속도 증가', description: '기본 공격의 발사 속도가 영구적으로 증가합니다.', type: 'player', cost: 150, costIncrease: 50, maxStacks: 5, apply: (p) => { p.shootCooldown = Math.max(5, p.shootCooldown * 0.85); p.firerateUpgradesCount++; } },
    { id: 'damage', name: '데미지 증가', description: '공격력이 25% 증가합니다. (최대 2회)', type: 'player', cost: 250, costIncrease: 100, maxStacks: 2, apply: (p) => { p.damageMultiplier += 0.25; p.damageUpgradesCount++; } },
    { id: 'multishot', name: '다중 발사', description: '기본 공격에 총알을 하나 추가합니다. (최대 3발)', type: 'player', cost: 300, costIncrease: 150, maxStacks: 2, apply: (p) => { p.multishotUpgradesCount++; } },
    { id: 'explosive', name: '폭발탄', description: '총알이 적에게 닿으면 폭발하여 주변에 피해를 줍니다.', type: 'player', cost: 400, costIncrease: 0, isAbility: true, apply: (p) => { if (!p.abilities.includes('explosive')) p.abilities.push('explosive'); } },
    // Skills
    { id: 'nova', name: '전방위 사격', description: '[Q,E,R] 키로 주변의 모든 적에게 피해를 줍니다.', type: 'player', cost: 200, costIncrease: 0, isSkill: true, apply: (p) => { if (p.skills.length < 3 && !p.skills.includes('nova')) { p.skills.push('nova'); p.skillTimers['nova'] = 0; } } },
    { id: 'blink', name: '점멸', description: '[우클릭] 또는 [Q,E,R] 키로 짧은 거리를 순간이동하며 경로의 적에게 피해를 줍니다.', type: 'player', cost: 200, costIncrease: 0, isSkill: true, apply: (p) => { if (p.skills.length < 3 && !p.skills.includes('blink')) { p.skills.push('blink'); p.skillTimers['blink'] = 0; } } },
    { id: 'barrier', name: '에너지 방벽', description: '[Q,E,R] 키로 잠시동안 방어막을 생성합니다.', type: 'player', cost: 200, costIncrease: 0, isSkill: true, apply: (p) => { if (p.skills.length < 3 && !p.skills.includes('barrier')) { p.skills.push('barrier'); p.skillTimers['barrier'] = 0; } } },
    { id: 'overdrive', name: '포탑 과부하', description: '[Q,E,R] 키로 모든 포탑의 공격 속도를 잠시 증가시킵니다.', type: 'player', cost: 200, costIncrease: 0, isSkill: true, apply: (p) => { if (p.skills.length < 3 && !p.skills.includes('overdrive')) { p.skills.push('overdrive'); p.skillTimers['overdrive'] = 0; } } },
];


function generateShopOptions() {
    const availableUpgrades = shopUpgradePool.filter(upg => {
        if (upg.id === 'addSentry' && sentries.length >= 3) return false;
        if (upg.id === 'towerHealth' && tower.maxHealth >= 700) return false;
        if (upg.isSkill && player.skills.length >= 3) return false;
        if (upg.isSkill && player.skills.includes(upg.id)) return false;
        if (upg.isAbility && player.abilities.includes(upg.id)) return false;

        if (upg.maxStacks) {
            if (upg.id === 'speed' && player.speedUpgradesCount >= upg.maxStacks) return false;
            if (upg.id === 'firerate' && player.firerateUpgradesCount >= upg.maxStacks) return false;
            if (upg.id === 'damage' && player.damageUpgradesCount >= upg.maxStacks) return false;
            if (upg.id === 'multishot' && player.multishotUpgradesCount >= upg.maxStacks) return false;
        }
        return true;
    });

    const chosenUpgrades = availableUpgrades.sort(() => 0.5 - Math.random()).slice(0, 3);

    for (let i = 0; i < 3; i++) {
        const optionEl = document.getElementById(`shop-option-${i}`);
        if (chosenUpgrades[i]) {
            const upgrade = chosenUpgrades[i];
            const titleEl = optionEl.querySelector('.option-title');
            const descEl = optionEl.querySelector('.option-desc');
            const btnEl = optionEl.querySelector('.select-option-btn');

            titleEl.textContent = upgrade.name;
            descEl.textContent = `${upgrade.description} (비용: ${shopCosts[upgrade.id]})`;

            const newBtn = btnEl.cloneNode(true);
            btnEl.parentNode.replaceChild(newBtn, btnEl);
            newBtn.onclick = () => purchaseShopOption(upgrade);
            optionEl.style.display = 'flex';
        } else {
            optionEl.style.display = 'none';
        }
    }
}

function purchaseShopOption(upgrade) {
    const cost = shopCosts[upgrade.id];
    if (score >= cost) {
        score -= cost;
        upgrade.apply(player);
        if (upgrade.costIncrease) {
            shopCosts[upgrade.id] += upgrade.costIncrease;
        }
        shopModal.classList.add('hidden');
    } else {
        // Optional: Add feedback for not enough score
        console.log("Not enough score!");
    }
}

// --- Game Flow & State Management ---
function resetGame() {
    if (animationId) cancelAnimationFrame(animationId);
    projectiles = []; enemies = []; particles = []; experienceOrbs = []; sentries = [];
    score = 0; wave = 0; gameTime = 0;
    gameState = 'LOBBY';
    player = new Player(canvas.width / 2 + 100, canvas.height / 2, '#00BFFF', 3.0);
    tower = new Tower(canvas.width / 2, canvas.height / 2, 87, '#FF4500');
    tower.health = 500; tower.maxHealth = 700;

    // Initialize costs
    shopUpgradePool.forEach(upg => {
        shopCosts[upg.id] = upg.cost;
    });

    loadHighScore();
    Object.values(skillSlots).forEach(slot => { slot.style.borderColor = '#fff'; slot.style.boxShadow = '0 0 8px #fff'; slot.style.opacity = 0.4; slot.innerHTML = slot.id.slice(-1).toUpperCase(); });
}

function initGame() {
    resetGame();
    uiContainer.classList.remove('hidden');
    canvas.classList.remove('hidden');
    gameState = 'START';
    bgm.play().catch(e => console.log("Audio play failed. User interaction needed."));
    animate();
}

function saveHighScore() {
    const currentWave = wave;
    const currentScoreTime = gameTime;
    let storedHighScore = JSON.parse(localStorage.getItem('neonSurvivorHighScore'));
    if (!storedHighScore || typeof storedHighScore.wave === 'undefined' || typeof storedHighScore.time === 'undefined') {
        storedHighScore = { wave: 0, time: Infinity };
    }

    if (currentWave > storedHighScore.wave || (currentWave === storedHighScore.wave && currentScoreTime < storedHighScore.time)) {
        localStorage.setItem('neonSurvivorHighScore', JSON.stringify({ wave: currentWave, time: currentScoreTime }));
    }
}

function loadHighScore() {
    const storedHighScore = JSON.parse(localStorage.getItem('neonSurvivorHighScore')) || { wave: 0, time: 0 };
    const totalSeconds = Math.floor(storedHighScore.time / 60);
    highScoreEl.textContent = `WAVE ${storedHighScore.wave} (시간: ${totalSeconds}초)`;
}

function resetHighScore() {
    const password = prompt("기록을 초기화하려면 비밀번호를 입력하세요:");
    if (password === "0415") {
        localStorage.removeItem('neonSurvivorHighScore');
        loadHighScore();
        alert("최고 기록이 초기화되었습니다.");
    } else {
        alert("비밀번호가 올바르지 않습니다.");
    }
}

function populateCodex() {
    codexPlayerUpgradesDiv.innerHTML = '';
    shopUpgradePool.forEach(upg => {
        const entry = document.createElement('div');
        entry.classList.add('codex-entry');
        entry.innerHTML = `<h4>${upg.name}</h4><p>${upg.description}</p>`;
        codexPlayerUpgradesDiv.appendChild(entry);
    });

    codexEnemiesDiv.innerHTML = '';
    const enemyDescriptions = [
        { name: '삼각형 적', desc: '가장 기본적인 적입니다. 플레이어나 타워를 향해 돌진하며, 가까워지면 잠시 빨라집니다.' },
        { name: '사각형 적', desc: '느리지만 체력이 높고 타워만 공격합니다. 파괴되면 작은 삼각형 2마리로 분열합니다.' },
        { name: '크리스마스 트리 적', desc: '플레이어만 노리며 등 뒤로 순간이동하여 공격합니다. 순간이동 시 잠시 사라졌다가 나타납니다.' },
        { name: '힐러 (십자가)', desc: '주변의 아군 적들의 체력을 주기적으로 회복시킵니다. 우선적으로 제거해야 합니다.' },
        { name: '소환사 (오각형)', desc: '멀리서 작은 삼각형 적들을 계속해서 소환합니다. 소환 주기가 빠릅니다.' },
        { name: '레이저 사수 (마름모)', desc: '조준선을 보여준 후 강력한 폭발성 발사체를 발사합니다.' },
        { name: '작은 삼각형 적', desc: '사각형 적이 파괴될 때 나타나는 작고 빠른 적입니다.' },
        { name: '육각형 적', desc: '주기적으로 다른 적(레이저 사수)을 소환하는 위협적인 적입니다.' },
        { name: '점멸하는 적 (분홍 사각형)', desc: '목표를 향해 점멸하며 경로에 피해를 줍니다. 점멸 전 경로가 붉게 표시됩니다.' },
        { name: '부메랑 적 (갈색 오각형)', desc: '일정 거리를 유지하며 돌아오는 부메랑을 던져 공격합니다.' },
    ];
    enemyDescriptions.forEach(enemy => {
        const entry = document.createElement('div');
        entry.classList.add('codex-entry');
        entry.innerHTML = `<h4>${enemy.name}</h4><p>${enemy.desc}</p>`;
        codexEnemiesDiv.appendChild(entry);
    });
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
    tower.draw();
    sentries.forEach(s => s.update());
    if (gameState !== 'GAME_OVER') player.update(); else player.draw();
    particles.forEach((p, i) => { if (p.alpha <= 0) particles.splice(i, 1); else p.update(); });
    projectiles.forEach((p, i) => { if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) projectiles.splice(i, 1); else p.update(); });
    experienceOrbs.forEach((orb, i) => { orb.update(); const dist = Math.hypot(player.x - orb.x, player.y - orb.y); if (dist < player.width / 2 + orb.radius + 50) { score += orb.value; experienceOrbs.splice(i, 1); } });

    // Update and draw enemies
    if (gameState !== 'SHOP_PHASE') {
        enemies.forEach(e => e.update());
    } else {
        enemies.forEach(e => e.draw());
    }

    if (player.state === 'DEAD') {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '60px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(player.reviveTimer / 60), player.x, player.y - 50);
        ctx.restore();
    }

    if (gameState === 'WAVE_IN_PROGRESS') {
        gameTime++;

        projectiles.forEach(projectile => {
            projectile.enemiesHitThisFrame.clear(); // Clear for this frame's collision checks
        });

        if (enemiesToSpawn.length > 0) {
            spawnTimer = (spawnTimer || 0) + 1;
            if (spawnTimer >= 120) { // Reverted further
                const enemyType = enemiesToSpawn.pop(); let x, y; const radius = 20;
                if (Math.random() < 0.5) { x = Math.random() < 0.5 ? 0 - radius : canvas.width + radius; y = Math.random() * canvas.height; } else { x = Math.random() * canvas.width; y = Math.random() < 0.5 ? 0 - radius : canvas.height + radius; }
                if (enemyType === 'triangle') enemies.push(new TriangleEnemy(x, y, wave === 1 ? 40 : 10));
                if (enemyType === 'square') enemies.push(new SquareEnemy(x, y));
                if (enemyType === 'tinyTriangle') enemies.push(new TinyTriangleEnemy(x, y));
                if (enemyType === 'tree') enemies.push(new ChristmasTreeEnemy(x, y));
                if (enemyType === 'healer') enemies.push(new HealerEnemy(x, y));
                if (enemyType === 'summoner') enemies.push(new SummonerEnemy(x, y));
                if (enemyType === 'laser') enemies.push(new LaserEnemy(x, y));
                if (enemyType === 'hexagon') enemies.push(new HexagonEnemy(x, y));
                if (enemyType === 'blinking') enemies.push(new BlinkingEnemy(x, y));
                if (enemyType === 'boomerang') enemies.push(new BoomerangEnemy(x, y));
                spawnTimer = 0;
            }
        } else if (enemies.length === 0) { gameState = 'WAVE_CLEAR'; waveClearTimer = 120; showWaveAnnouncer('WAVE CLEAR'); } // Reverted
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            if (player.state === 'ALIVE') {
                const distPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
                if (distPlayer - enemy.radius - player.width / 2 < 1 && player.invincibleTimer <= 0) {
                    if(enemy.attackTimer <= 0){
                        player.health -= enemy.damage;
                        player.health = Math.max(0, player.health);
                        enemy.attackTimer = enemy.attackCooldown;
                        if(player.health <= 0) {
                            player.state = 'DEAD';
                            player.reviveTimer = 600; // 10 seconds
                            for(let k=0; k<20; k++) { particles.push(new Particle(player.x, player.y, Math.random() * 4, player.color, { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 })); }
                        }
                    }
                }
                if (player.activeEffects['barrier']) { const distBarrier = Math.hypot(player.x - enemy.x, player.y - enemy.y); if (distBarrier < player.width * 2.5 + enemy.radius) { enemy.health -= 0.5; } }
            }
            const distTower = Math.hypot(tower.x - enemy.x, tower.y - enemy.y); 
            if (distTower - enemy.radius - tower.size / 2 < 1) { 
                if(enemy.attackTimer <= 0){ 
                    tower.health -= enemy.damage; 
                    enemy.attackTimer = enemy.attackCooldown; 
                } 
            }
        }

        // Player/Sentry Projectile - Enemy Collision
        for (let j = projectiles.length - 1; j >= 0; j--) {
            const projectile = projectiles[j];
            // Check if projectile is from player or sentry (i.e., not an enemy projectile)
            if (!projectile.owner && !projectile.isFromLaserEnemy && !(projectile instanceof BoomerangProjectile)) {
                for (let i = enemies.length - 1; i >= 0; i--) {
                    const enemy = enemies[i];
                    if (!projectile || !enemy) continue;

                    if (projectile.enemiesHitThisFrame.has(enemy)) {
                        continue;
                    }

                    const dist = Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y);
                    if (dist - enemy.radius - projectile.radius < 1) {
                        projectile.enemiesHitThisFrame.add(enemy);

                        if (projectile.isExplosive) {
                            for (let k = 0; k < 40; k++) { particles.push(new Particle(projectile.x, projectile.y, Math.random() * 10 + 5, 'orange', { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 })); } 
                            enemies.forEach(expEnemy => {
                                if (expEnemy !== enemy) {
                                    const expDist = Math.hypot(projectile.x - expEnemy.x, projectile.y - expEnemy.y);
                                    if (expDist < 75) {
                                        expEnemy.health -= 10;
                                    }
                                }
                            });
                        }
                        enemy.health -= projectile.damage;
                        
                        if (projectile.pierceCount > 0) {
                            projectile.pierceCount--;
                        } else {
                            projectiles.splice(j, 1);
                        }

                        if (enemy.health <= 0) {
                            if (enemy instanceof SquareEnemy) { for (let k = 0; k < 2; k++) { enemies.push(new TinyTriangleEnemy(enemy.x + (Math.random() - 0.5) * 20, enemy.y + (Math.random() - 0.5) * 20)); } }
                            const xpBonus = wave > 1 ? 5 : 0;
                            experienceOrbs.push(new ExperienceOrb(enemy.x, enemy.y, 5, '#00FF00', Math.max(1, enemy.xpValue + xpBonus + (Math.random() * 20 - 10))));
                            enemies.splice(i, 1);
                        }
                        if (projectiles[j] === undefined) break;
                    }
                }
            }
        }

        // Enemy Projectile - Player/Tower Collision
        for (let j = projectiles.length - 1; j >= 0; j--) {
            const projectile = projectiles[j];
            // Check if projectile is from an enemy
            if (projectile.owner instanceof Enemy || projectile.isFromLaserEnemy || projectile instanceof BoomerangProjectile) {
                // Collision with Player
                const distPlayer = Math.hypot(projectile.x - player.x, projectile.y - player.y);
                if (distPlayer < projectile.radius + player.width / 2) {
                    if (player.invincibleTimer <= 0) {
                        player.health -= projectile.damage;
                        player.health = Math.max(0, player.health);
                        player.invincibleTimer = 30;
                    }
                    if (!(projectile.pierceCount > 0) && !(projectile instanceof BoomerangProjectile)) {
                        projectiles.splice(j, 1);
                        continue;
                    }
                }

                // Collision with Tower
                const distTower = Math.hypot(projectile.x - tower.x, projectile.y - tower.y);
                if (distTower < projectile.radius + tower.size / 2) {
                    tower.health -= projectile.damage;
                    if (!(projectile.pierceCount > 0) && !(projectile instanceof BoomerangProjectile)) {
                        projectiles.splice(j, 1);
                        continue;
                    }
                }
            }
        }
    }
    else if (gameState === 'WAVE_CLEAR') { waveClearTimer--; if (waveClearTimer <= 0) { gameState = 'SHOP_PHASE'; shopPhaseTimer = 300; shopAnnounced = false; } } else if (gameState === 'SHOP_PHASE') { if(!shopAnnounced) { showWaveAnnouncer('상점 시간 - 타워 우클릭'); shopAnnounced = true; } if (shopModal.classList.contains('hidden') && rouletteModal.classList.contains('hidden')) { shopPhaseTimer--; } shopTimerEl.textContent = Math.ceil(shopPhaseTimer / 60); if (shopPhaseTimer <= 0) { shopModal.classList.add('hidden'); rouletteModal.classList.add('hidden'); gameState = 'START'; } } else if (gameState === 'START') { startWave(); } 
    if (tower.health <= 0 && gameState !== 'GAME_OVER') { gameState = 'GAME_OVER'; }
    if(gameState === 'GAME_OVER') { saveHighScore(); currentScoreEl.textContent = `WAVE ${wave} (시간: ${Math.floor(gameTime/60)}초)`; uiContainer.classList.add('hidden'); canvas.classList.add('hidden'); gameOverModal.classList.remove('hidden'); bgm.pause(); bgm.currentTime = 0; cancelAnimationFrame(animationId); return; }
    playerHpEl.textContent = Math.max(0, player.health); towerHpEl.textContent = tower.health; xpEl.textContent = Math.floor(score);
    enemyCountEl.textContent = enemies.length;
    const skillKeys = ['q', 'e', 'r']; const skillColors = { nova: '#FFD700', blink: '#00FFFF', barrier: '#FF00FF', overdrive: '#FFA500' };
    skillKeys.forEach((key, i) => { const skillId = player.skills[i]; if (skillId) { skillSlots[key].style.borderColor = skillColors[skillId]; skillSlots[key].style.opacity = 1 - (player.skillTimers[skillId] / player.skillCooldowns[skillId]); } else { skillSlots[key].style.borderColor = '#fff'; skillSlots[key].style.opacity = 0.4; } });
}


// --- Event Listeners ---
startGameBtn.addEventListener('click', () => { lobbyModal.classList.add('hidden'); initGame(); });
restartGameBtn.addEventListener('click', () => { gameOverModal.classList.add('hidden'); lobbyModal.classList.remove('hidden'); loadHighScore(); });
resetHighScoreBtn.addEventListener('click', resetHighScore);
controlsBtn.addEventListener('click', () => { controlsModal.classList.remove('hidden'); });
closeControlsBtn.addEventListener('click', () => { controlsModal.classList.add('hidden'); });
codexBtn.addEventListener('click', () => { populateCodex(); codexModal.classList.remove('hidden'); });
closeCodexBtn.addEventListener('click', () => { codexModal.classList.add('hidden'); });
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('keydown', (e) => { const key = e.key.toLowerCase(); if (key in keys) keys[key] = true; if (key === 'escape') { if (gameState === 'PAUSED') { gameState = previousGameState; } else if (gameState !== 'LOBBY' && gameState !== 'GAME_OVER') { previousGameState = gameState; gameState = 'PAUSED'; } } });
window.addEventListener('keyup', (e) => { const key = e.key.toLowerCase(); if (key in keys) keys[key] = false; });
window.addEventListener('mousedown', e => { 
    if (e.button === 0) keys.mouse0 = true; 
    if (e.button === 2) { // Right-click
        e.preventDefault();
        if (player && player.state === 'ALIVE' && player.skills.includes('blink') && gameState !== 'SHOP_PHASE') {
            player.activateSkill('blink');
        }
    }
});
window.addEventListener('mouseup', e => { if (e.button === 0) keys.mouse0 = false; });
window.addEventListener('contextmenu', e => { 
    e.preventDefault(); 
    if (gameState === 'SHOP_PHASE') { 
        const dist = Math.hypot(e.clientX - tower.x, e.clientY - tower.y); 
        if (dist < tower.size) { 
            generateShopOptions(); 
            shopModal.classList.remove('hidden'); 
        } 
    } 
});
closeShopBtn.addEventListener('click', () => { shopModal.classList.add('hidden'); });

window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; tower.x = canvas.width / 2; tower.y = canvas.height / 2; if(player) { player.x = canvas.width/2 + 100; player.y = canvas.height/2; } });

// --- Initial call ---
resetGame();
lobbyModal.classList.remove('hidden');
uiContainer.classList.add('hidden');
canvas.classList.add('hidden');
