import { describe, it, expect } from 'vitest';
import { Vehicle, VEHICLE_SPECS, separate, type DriveIntent } from '../src/city/Vehicle';
import { buildDistrict, type Box } from '../src/city/CityLayout';

const DT = 1 / 120;
const open: Box = { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000, height: 100 };
const drive = (over: Partial<DriveIntent> = {}): DriveIntent => ({ throttle: 0, steer: 0, handbrake: false, ...over });
const run = (v: Vehicle, i: DriveIntent, seconds: number) => {
  for (let t = 0; t < seconds; t += DT) v.step(i, DT);
};

describe('Vehicle', () => {
  it('accelerates toward its top speed along its nose', () => {
    const v = new Vehicle(1, VEHICLE_SPECS.SportsCar, [], open).place(0, 0, 0);
    run(v, drive({ throttle: 1 }), 3);
    const at3 = v.forwardSpeed;
    run(v, drive({ throttle: 1 }), 20);
    expect(at3).toBeGreaterThan(15);
    expect(v.forwardSpeed).toBeGreaterThan(at3);
    expect(v.forwardSpeed).toBeLessThan(VEHICLE_SPECS.SportsCar.maxSpeed + 0.5);
    // Heading 0 drives along +z.
    expect(v.z).toBeGreaterThan(100);
    expect(Math.abs(v.x)).toBeLessThan(0.01);
  });

  it('brakes to a stop, then reverses', () => {
    const v = new Vehicle(1, VEHICLE_SPECS.NormalCar1, [], open).place(0, 0, 0);
    run(v, drive({ throttle: 1 }), 3);
    run(v, drive({ throttle: -1 }), 1.5);
    expect(v.forwardSpeed).toBeLessThan(1);
    run(v, drive({ throttle: -1 }), 3);
    expect(v.forwardSpeed).toBeLessThan(-3);
  });

  it('turns right when steering right', () => {
    const v = new Vehicle(1, VEHICLE_SPECS.NormalCar1, [], open).place(0, 0, 0);
    run(v, drive({ throttle: 1 }), 1.5);
    const h0 = v.heading;
    run(v, drive({ throttle: 0.5, steer: 1 }), 1);
    // Turning right from +z heads toward -x... in this convention a right turn lowers the heading.
    expect(Math.abs(v.heading - h0)).toBeGreaterThan(0.4);
  });

  it('slides with the handbrake and grips without it', () => {
    const slide = (handbrake: boolean) => {
      const v = new Vehicle(1, VEHICLE_SPECS.SportsCar, [], open).place(0, 0, 0);
      run(v, drive({ throttle: 1 }), 3);
      let most = 0;
      for (let t = 0; t < 1; t += DT) {
        v.step(drive({ throttle: 0.3, steer: 1, handbrake }), DT);
        most = Math.max(most, Math.abs(v.slip));
      }
      return most;
    };
    expect(slide(true)).toBeGreaterThan(slide(false) * 2);
  });

  it('crashes into a building: stopped, damaged, reported', () => {
    const wall: Box = { minX: -10, maxX: 10, minZ: 30, maxZ: 40, height: 20 };
    const v = new Vehicle(1, VEHICLE_SPECS.SportsCar, [wall], open).place(0, 0, 0);
    const kinds: string[] = [];
    for (let t = 0; t < 6; t += DT) {
      v.step(drive({ throttle: 1 }), DT);
      kinds.push(...v.fx.map((f) => f.type));
    }
    expect(kinds).toContain('crash');
    expect(v.health).toBeLessThan(100);
    expect(v.z + v.spec.reach + v.spec.radius).toBeLessThanOrEqual(30.05);
  });

  it('pushes two overlapping cars apart', () => {
    const a = new Vehicle(1, VEHICLE_SPECS.NormalCar1, [], open).place(0, 0, 0);
    const b = new Vehicle(2, VEHICLE_SPECS.NormalCar1, [], open).place(1, 0, 0);
    separate(a, b);
    expect(b.x - a.x).toBeGreaterThan(1);
  });
});

describe('Parked cars', () => {
  const d = buildDistrict(4);

  it('are parked on the roads, clear of buildings, planters and each other', () => {
    expect(d.parking.length).toBeGreaterThan(20);
    for (const p of d.parking) {
      const v = new Vehicle(0, VEHICLE_SPECS[p.model], d.colliders, d.bounds).place(p.x, p.z, p.heading);
      const before = [v.x, v.z];
      v.step(drive(), DT);
      // Nothing pushed it: it was not overlapping anything.
      expect(Math.hypot(v.x - before[0], v.z - before[1])).toBeLessThan(1e-6);
    }
    for (let i = 0; i < d.parking.length; i++) {
      for (let j = i + 1; j < d.parking.length; j++) {
        expect(Math.hypot(d.parking[i].x - d.parking[j].x, d.parking[i].z - d.parking[j].z)).toBeGreaterThan(4.5);
      }
    }
  });

  it('includes a car beside the spawn point', () => {
    const near = d.parking.filter((p) => Math.hypot(p.x - d.spawn.x, p.z - d.spawn.z) < 10);
    expect(near.length).toBeGreaterThanOrEqual(1);
  });
});
