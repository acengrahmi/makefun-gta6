// Combat: the player's pistol (mouse aim, hitscan), Vipers gang members who shoot
// back, muzzle flashes and tracers. No ammo limit — the fun is the firefight.
import { clamp, dist2D, mulberry32 } from './util.js';
import { Person } from './people.js';

export class CombatSystem {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.enemies = [];
    this.tracers = [];
    this.flashLight = new THREE.PointLight(0xffc86a, 0, 18);
    this.scene.add(this.flashLight);
    this.cooldown = 0;
    this.muzzleTimer = 0;
  }

  /** Spawn `count` gang members around (x,z) for a fight. Returns the enemies. */
  spawnGang(x, z, count, seed) {
    const rng = mulberry32(seed);
    const made = [];
    for (let i = 0; i < count; i += 1) {
      const e = new Person(this.scene, 'gang', rng);
      const a = rng() * Math.PI * 2;
      e.setPose(x + Math.sin(a) * (6 + rng() * 10), z + Math.cos(a) * (6 + rng() * 10), a);
      e.shootCooldown = 1 + rng() * 2;
      this.enemies.push(e);
      made.push(e);
    }
    return made;
  }

  clearGang() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  get aliveCount() {
    return this.enemies.filter((e) => !e.dead).length;
  }

  /** Player fires from `origin` along `dir` (both Vector3). Returns the enemy hit, if any. */
  playerShoot(origin, dir, onHit) {
    if (this.cooldown > 0) return null;
    this.cooldown = 0.22;
    this.muzzleTimer = 0.06;
    this.flashLight.position.copy(origin);
    this.flashLight.intensity = 2.2;
    const end = origin.clone().addScaledVector(dir, 70);
    let hitEnemy = null; let hitDist = 70;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ex = e.x - origin.x, ey = 1.2 - origin.y, ez = e.z - origin.z;
      const along = ex * dir.x + ey * dir.y + ez * dir.z;
      if (along < 0 || along > hitDist) continue;
      const px = origin.x + dir.x * along - e.x;
      const py = origin.y + dir.y * along - 1.2;
      const pz = origin.z + dir.z * along - e.z;
      const miss = Math.sqrt(px * px + py * py + pz * pz);
      if (miss < 1.3) { hitEnemy = e; hitDist = along; }
    }
    if (hitEnemy) {
      end.copy(origin).addScaledVector(dir, hitDist);
      hitEnemy.health -= 34;
      if (hitEnemy.health <= 0) {
        hitEnemy.die(this.scene);
        if (onHit) onHit(hitEnemy, true);
      } else if (onHit) onHit(hitEnemy, false);
    }
    this.addTracer(origin, end);
    return hitEnemy;
  }

  addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  /** Enemies advance, take cover-ish distance, and shoot at the player. */
  update(dt, playerPos, onPlayerHit) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.muzzleTimer -= dt;
    if (this.muzzleTimer <= 0) this.flashLight.intensity = 0;
    for (const t of this.tracers) {
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(this.tracers.indexOf(t), 1);
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2D(e.x, e.z, playerPos.x, playerPos.z);
      const want = Math.atan2(playerPos.x - e.x, playerPos.z - e.z);
      let diff = want - e.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.heading += clamp(diff, -3 * dt, 3 * dt);
      // close in to ~14 units, then hold and fire
      if (d > 16) {
        e.speed = 3.2;
        e.walkPhase += dt * 8;
        e.x += Math.sin(e.heading) * e.speed * dt;
        e.z += Math.cos(e.heading) * e.speed * dt;
      } else {
        e.speed = 0;
        e.walkPhase += dt * 2;
      }
      e.syncMesh();
      e.shootCooldown -= dt;
      if (e.shootCooldown <= 0 && d < 34) {
        e.shootCooldown = 1.4 + Math.random() * 1.2;
        const from = new THREE.Vector3(e.x, 1.4, e.z);
        const to = new THREE.Vector3(playerPos.x, 1.2, playerPos.z);
        this.addTracer(from, to);
        // inaccuracy grows with distance; point-blank shots land
        if (Math.random() < clamp(0.55 - d * 0.012, 0.08, 0.55)) onPlayerHit(6 + Math.random() * 7);
      }
    }
  }
}
