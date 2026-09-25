# Checks the retargeted clips in assets-src/cast/anims.glb against the Universal Animation Library
# sources they came from, with no renderer: for every clip, at every few frames, each limb segment
# (upper arm, forearm, thigh, shin, each spine bone, neck) must point the same way in both skeletons, and the
# feet must stay on the ground in the standing clips. The palms sit a fixed ~12 deg apart (the
# skeletons place the pinky knuckle differently), so 12 deg is the bar; thumbs are not compared,
# their roots sit ~40 deg apart for the same reason.
#
#   blender -b --python scripts/assets/blender/check-cast.py
import bpy
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, os.path.dirname(__file__))
UAL = [
    os.path.join(ROOT, 'assets-src', 'quaternius', 'anims', 'Universal Animation Library[Standard]', 'Unreal-Godot', 'UAL1_Standard.glb'),
    os.path.join(ROOT, 'assets-src', 'quaternius', 'anims2', 'Universal Animation Library 2[Standard]', 'Unreal-Godot', 'UAL2_Standard.glb'),
]
SEGMENTS = [('upperarm_l', 'lowerarm_l'), ('lowerarm_l', 'hand_l'), ('upperarm_r', 'lowerarm_r'), ('lowerarm_r', 'hand_r'),
            ('thigh_l', 'calf_l'), ('calf_l', 'foot_l'), ('thigh_r', 'calf_r'), ('calf_r', 'foot_r'),
            ('pelvis', 'spine_01'), ('spine_01', 'spine_02'), ('spine_02', 'spine_03'), ('spine_03', 'neck_01'),
            ('neck_01', 'head'), ('hand_l', 'index_01_l'), ('hand_l', 'pinky_01_l'), ('hand_r', 'index_01_r'), ('hand_r', 'pinky_01_r'), ('foot_l', 'ball_l'), ('foot_r', 'ball_r')]
GROUNDED = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Pistol_Idle_Loop', 'Pistol_Shoot', 'Pistol_Reload', 'Idle_Talking_Loop']

bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path):
    before, acts = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    arm = [o for o in bpy.data.objects if o not in before and o.type == 'ARMATURE'][0]
    return arm, {a.name: a for a in bpy.data.actions if a not in acts}


target, t_actions = load(os.path.join(ROOT, 'assets-src', 'cast', 'anims.glb'))
tname = {n.rsplit('_', 1)[0] if n.endswith('_' + target.name) else n: a for n, a in t_actions.items()}
worst_all = 0.0
failures = []
for path in UAL:
    source, s_actions = load(path)
    sname = {n[:-len('_' + source.name)]: a for n, a in s_actions.items() if n.endswith('_' + source.name)}
    for clip, sa in sname.items():
        ta = tname.get(clip)
        if not ta:
            continue
        worst = 0.0
        worst_seg = ''
        low = 9.0
        start, end = sa.frame_range
        for f in range(int(start), int(end) + 1, 3):
            source.animation_data.action = sa
            target.animation_data.action = ta
            bpy.context.scene.frame_set(f)
            sp = {pb.name: source.matrix_world @ pb.head for pb in source.pose.bones}
            tp = {pb.name: target.matrix_world @ pb.head for pb in target.pose.bones}
            sp['head'] = sp['Head']
            for a, b in SEGMENTS:
                ds = (sp[b] - sp[a]).normalized()
                dt = (tp[b] - tp[a]).normalized()
                if ds.angle(dt) > worst:
                    worst, worst_seg = ds.angle(dt), a + '>' + b + '@' + str(f)
            low = min(low, tp['ball_l'].z, tp['ball_r'].z, tp['foot_l'].z, tp['foot_r'].z)
        deg = worst * 57.2958
        worst_all = max(worst_all, deg)
        print(f'CHECK {clip:26s} worst limb angle {deg:5.1f} deg, lowest foot joint {low:+.3f} m {worst_seg}')
        if deg > 12:
            failures.append(f'{clip}: limbs off by {deg:.1f} deg')
        if clip in GROUNDED and not (-0.03 < low < 0.12):
            failures.append(f'{clip}: feet at {low:+.3f} m')
    bpy.data.objects.remove(source)
print('WORST', round(worst_all, 1))
print('FAILURES', failures if failures else 'none')
