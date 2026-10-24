# Builds VORIXA City's realistic cast (ADR-0014) in Blender, headless:
#
#   blender -b --python scripts/assets/blender/make-cast.py [-- --only vex,rook] [--skip-anims]
#
# Each character is a MakeHuman body (MPFB 2, CC0 system assets and CC0 asset packs) with a skin,
# eyes, brows, lashes, hair and clothes, on MPFB's "game_engine" skeleton, written to
# assets-src/cast/<id>.glb without animation.
#
# The clips come from Quaternius' Universal Animation Library 1 and 2 (CC0), whose skeleton uses
# the same bone names but a T-pose, and are retargeted onto the game_engine skeleton once, into
# assets-src/cast/anims.glb: a bare skeleton carrying every clip. Every character shares it, since
# the game binds clips by bone name.
#
# Retargeting works in armature space, per bone, per frame. The target's rest pose (an A-pose) is
# first turned, bone by bone, to point the way the source's T-pose points; after that a bone's
# rotation away from the T-pose in the source is applied to the same bone in the target. The pelvis
# also moves, scaled by the ratio of hip heights.
#
# Then scripts/assets/build-city.mjs compresses both into public/city/people.
import bpy
import os
import sys
from importlib import import_module
from mathutils import Matrix, Vector, Quaternion

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets-src', 'cast')
UAL = [
    os.path.join(ROOT, 'assets-src', 'quaternius', 'anims', 'Universal Animation Library[Standard]', 'Unreal-Godot', 'UAL1_Standard.glb'),
    os.path.join(ROOT, 'assets-src', 'quaternius', 'anims2', 'Universal Animation Library 2[Standard]', 'Unreal-Godot', 'UAL2_Standard.glb'),
]
FPS = 24

# The clips the game plays. Rifles use the pistol stances: the library has no rifle set.
CLIPS = [
    'Idle_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop',
    'Pistol_Idle_Loop', 'Pistol_Aim_Neutral', 'Pistol_Aim_Up', 'Pistol_Aim_Down', 'Pistol_Shoot', 'Pistol_Reload',
    'Death01', 'Hit_Chest', 'Hit_Head', 'Interact', 'Driving_Loop', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop',
    'Idle_Talking_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Roll',
    'Punch_Jab', 'Punch_Cross', 'Dance_Loop', 'Push_Loop', 'Fixing_Kneeling',
    # Universal Animation Library 2
    'Idle_TalkingPhone_Loop', 'Idle_FoldArms_Loop', 'Idle_No_Loop', 'Yes', 'Hit_Knockback', 'ClimbUp_1m',
    'Slide_Start', 'Slide_Loop', 'Slide_Exit', 'Walk_Carry_Loop', 'Idle_Rail_Call', 'OverhandThrow',
    # The fighter (ADR-0016): stance, guard, hooks, the energy blast, ninja jumps, getting up.
    'Melee_Hook', 'Melee_Hook_Rec', 'Idle_Shield_Loop', 'Idle_Shield_Break', 'Sword_Block', 'LayToIdle',
    'Spell_Simple_Enter', 'Spell_Simple_Shoot', 'NinjaJump_Start', 'NinjaJump_Idle_Loop', 'NinjaJump_Land', 'Shield_Dash',
]

# Source bone name → target bone name, where they differ.
RENAME = {'Head': 'head', 'root': 'Root'}

M, F = 1.0, 0.0


def person(gender, age, skin, hair, clothes, muscle=0.5, weight=0.5, height=0.5, race=None, brows='eyebrow001', lashes='eyelashes01'):
    # MakeHuman's age slider: 0.1875 is 11, 0.5 is 25, 1.0 is 90.
    return dict(gender=gender, age=age, skin=skin, hair=hair, clothes=clothes, muscle=muscle, weight=weight,
                height=height, race=race, brows=brows, lashes=lashes)


# Only assets whose files say CC0 (checked per asset; the community packs mix in AGPL and CC-BY
# items, which are left out). No clothing with the MakeHuman logo printed on it.
CAST = {
    # The crew
    'vex': person(M, 0.5, 'young_caucasian_male2', 'short02', ['male_casualsuit05', 'shoes02'], muscle=0.6, height=0.6,
                  race=(0.1, 0.8, 0.1)),
    'rook': person(M, 0.55, 'young_african_male', 'short01', ['elvs_crude_t-shirt_male', 'toigo_wool_pants', 'toigo_ankle_boots_male'],
                   muscle=1.0, weight=0.75, height=0.8, race=(0.9, 0.1, 0.0)),
    'silas': person(M, 0.72, 'middleage_caucasian_male', 'short04', ['male_elegantsuit01', 'shoes04'], height=0.65, weight=0.45,
                    race=(0.0, 1.0, 0.0), brows='eyebrow006'),
    'mara': person(F, 0.5, 'young_caucasian_female', 'ponytail01', ['male_worksuit01', 'toigo_ankle_boots_female'], muscle=0.6,
                   race=(0.0, 1.0, 0.0), brows='eyebrow010'),
    'juno': person(F, 0.45, 'young_caucasian_female2', 'braid01', ['female_sportsuit01', 'shoes06'], muscle=0.6, height=0.45,
                   race=(0.25, 0.6, 0.15), brows='eyebrow010'),
    'kai': person(M, 0.47, 'young_asian_male', 'short03', ['namuhekam_male_polo_shirt', 'toigo_wool_pants', 'shoes05'], height=0.5,
                  race=(0.0, 0.1, 0.9)),
    'dex': person(M, 0.52, 'young_african_male', 'afro01', ['male_casualsuit06', 'shoes06'], height=0.6, race=(1.0, 0.0, 0.0)),
    'mo': person(M, 0.68, 'middleage_caucasian_male', 'short02', ['male_worksuit01', 'toigo_ankle_boots_male'], muscle=0.85, weight=0.8,
                 height=0.7, race=(0.25, 0.75, 0.0), brows='eyebrow006'),
    'iris': person(F, 0.48, 'young_asian_female', 'toigo_inverted_bob_with_bangs',
                   ['toigo_fisherman_sweater', 'toigo_wool_pants', 'toigo_ankle_boots_female'], race=(0.0, 0.15, 0.85), brows='eyebrow010'),
    'nova': person(F, 0.5, 'young_african_female', 'long01', ['toigo_halter_dress_midi', 'toigo_stiletto_booties'], height=0.65,
                   race=(0.85, 0.15, 0.0), brows='eyebrow010'),
    # The Choir
    'choir-enforcer': person(M, 0.55, 'young_caucasian_male', 'short01', ['male_elegantsuit01', 'shoes03'], muscle=0.9, weight=0.65,
                             height=0.75, race=(0.2, 0.7, 0.1)),
    'choir-soldier': person(F, 0.5, 'young_caucasian_female', 'bob01', ['female_sportsuit01', 'shoes03'], muscle=0.7,
                            race=(0.1, 0.6, 0.3), brows='eyebrow010'),
    'choir-lieutenant': person(M, 0.65, 'middleage_african_male', 'short04', ['male_elegantsuit01', 'shoes04', 'fedora01'],
                               height=0.7, race=(0.8, 0.2, 0.0)),
    'cantor': person(M, 0.85, 'old_caucasian_male', 'short02', ['male_elegantsuit01', 'shoes04', 'fedora_cocked'], weight=0.75,
                     height=0.75, race=(0.0, 1.0, 0.0), brows='eyebrow006'),
    # The police
    'police': person(M, 0.55, 'young_caucasian_male', 'short04', ['namuhekam_male_polo_shirt', 'toigo_wool_pants', 'shoes03'],
                     muscle=0.7, height=0.65, race=(0.3, 0.5, 0.2)),
    # Citizens
    'citizen-1': person(M, 0.5, 'young_caucasian_male', 'short03', ['male_casualsuit03', 'shoes01'], race=(0.0, 0.9, 0.1)),
    'citizen-2': person(M, 0.66, 'middleage_african_male', 'short01', ['male_casualsuit01', 'shoes02'], weight=0.7, race=(0.9, 0.1, 0.0)),
    'citizen-3': person(M, 0.45, 'young_asian_male', 'short04', ['elvs_crude_t-shirt_male', 'toigo_wool_pants', 'shoes05'],
                        weight=0.4, race=(0.0, 0.0, 1.0)),
    'citizen-4': person(M, 0.9, 'old_caucasian_male', 'short02', ['male_casualsuit05', 'shoes04'], weight=0.6, height=0.4,
                        race=(0.0, 1.0, 0.0), brows='eyebrow006'),
    'citizen-5': person(M, 0.66, 'middleage_asian_male', 'short02', ['namuhekam_male_polo_shirt', 'toigo_wool_pants', 'shoes01'],
                        weight=0.7, race=(0.0, 0.2, 0.8)),
    'citizen-6': person(M, 0.48, 'young_african_male', 'afro01', ['male_casualsuit06', 'shoes06'], height=0.7, race=(1.0, 0.0, 0.0)),
    'citizen-7': person(F, 0.48, 'young_caucasian_female', 'ponytail01', ['toigo_camisole_dress_with_full_skirt', 'toigo_ballet_flats'],
                        race=(0.0, 1.0, 0.0), brows='eyebrow010'),
    'citizen-8': person(F, 0.5, 'young_african_female', 'afro01', ['toigo_keyhole_tank_top', 'toigo_wool_pants', 'toigo_flats'],
                        race=(1.0, 0.0, 0.0), brows='eyebrow010'),
    'citizen-9': person(F, 0.66, 'middleage_asian_female', 'toigo_curled_under_bob', ['female_elegantsuit01', 'toigo_mj_cloth_shoes'],
                        race=(0.0, 0.0, 1.0), brows='eyebrow010'),
    'citizen-10': person(F, 0.46, 'young_caucasian_female2', 'toigo_blunt_bob', ['toigo_fisherman_sweater', 'toigo_harem_pants',
                                                                                  'toigo_ballet_flats_with_bows'], race=(0.1, 0.9, 0.0),
                         brows='eyebrow010'),
    'citizen-11': person(F, 0.9, 'old_caucasian_female', 'bob02', ['toigo_shift_dress', 'toigo_mj_cloth_shoes'], weight=0.6,
                         height=0.35, race=(0.0, 1.0, 0.0), brows='eyebrow010'),
    'citizen-12': person(F, 0.45, 'young_asian_female', 'long01', ['toigo_dress_with_tiered_skirt', 'toigo_ballet_flats_with_flowers'],
                         race=(0.0, 0.0, 1.0), brows='eyebrow010'),
}


def service(name):
    mod = [m for m in sys.modules if m.endswith('mpfb.services.' + name.lower())]
    if not mod:
        raise RuntimeError('MPFB is not installed in this Blender (see docs/plans/VORIXA_CITY_PLAN.md)')
    return getattr(import_module(mod[0]), name)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def build(spec):
    HumanService = service('HumanService')
    info = HumanService._create_default_human_info_dict()
    ph = info['phenotype']
    ph['gender'], ph['age'], ph['muscle'], ph['weight'], ph['height'] = spec['gender'], spec['age'], spec['muscle'], spec['weight'], spec['height']
    if spec['race']:
        ph['race'] = dict(african=spec['race'][0], caucasian=spec['race'][1], asian=spec['race'][2])
    info['rig'] = 'game_engine'
    info['skin_mhmat'] = f"{spec['skin']}/{spec['skin']}.mhmat"
    info['skin_material_type'] = 'GAMEENGINE'
    info['eyes'] = 'low-poly/low-poly.mhclo'
    info['eyebrows'] = f"{spec['brows']}/{spec['brows']}.mhclo"
    info['eyelashes'] = f"{spec['lashes']}/{spec['lashes']}.mhclo"
    info['hair'] = f"{spec['hair']}/{spec['hair']}.mhclo"
    info['clothes'] = [f'{c}/{c}.mhclo' for c in spec['clothes']]
    settings = HumanService.get_default_deserialization_settings()
    settings['subdiv_levels'] = 0
    settings['override_clothes_model'] = 'GAMEENGINE'
    settings['override_eyes_model'] = 'GAMEENGINE'
    body = HumanService.deserialize_from_dict(info, settings)
    rig = body.parent
    # Name materials for what they are: the game gives skin, hair and cloth their own finish.
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.data.materials:
            continue
        part = o.name.split('.', 1)[1] if '.' in o.name else 'skin'
        if o is body:
            part = 'skin'
        elif part == 'low-poly':
            part = 'eyes'
        elif part == spec['hair']:
            part = 'hair'
        elif part == spec['brows']:
            part = 'eyebrow'
        elif part == spec['lashes']:
            part = 'eyelash'
        for m in o.data.materials:
            if m:
                m.name = part
    return body, rig


def export_character(name):
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_animations=False, export_morph=False,
                              export_skins=True, export_yup=True, export_image_format='AUTO', export_extras=False)
    print('CAST', name, os.path.getsize(path))


# ─── Retargeting ──────────────────────────────────────────────────────────────────────────────
def aim(bone_heads, name, children, tail):
    """Direction a bone points: to its main child's head, or its tail when it has none."""
    kids = [c for c in children.get(name, []) if c in bone_heads]
    if kids:
        prefer = [c for c in kids if c.startswith(('middle_01', 'spine', 'neck', 'head', 'Head', 'calf', 'foot', 'ball', 'lowerarm', 'hand'))]
        c = (prefer or kids)[0]
        return (bone_heads[c] - bone_heads[name]).normalized()
    return tail.normalized()


def rest_frames(rig):
    heads, rots, tails, children = {}, {}, {}, {}
    for b in rig.data.bones:
        heads[b.name] = b.head_local.copy()
        rots[b.name] = b.matrix_local.to_quaternion()
        tails[b.name] = b.tail_local - b.head_local
        if b.parent:
            children.setdefault(b.parent.name, []).append(b.name)
    return heads, rots, tails, children


def pose_frames(rig):
    heads, rots, tails, children = {}, {}, {}, {}
    for pb in rig.pose.bones:
        heads[pb.name] = pb.head.copy()
        rots[pb.name] = pb.matrix.to_quaternion().normalized()
        tails[pb.name] = pb.tail - pb.head
        if pb.parent:
            children.setdefault(pb.parent.name, []).append(pb.name)
    return heads, rots, tails, children


def retarget(target, source, source_actions, clips):
    """Bakes each source clip onto the target skeleton as a new action. Returns the actions made."""
    t_heads, t_rots, t_tails, t_children = rest_frames(target)
    suffix = '_' + source.name
    src_actions = {a.name[:-len(suffix)]: a for a in source_actions if a.name.endswith(suffix)}
    tpose = src_actions.get('A_TPose')
    if not tpose:
        raise RuntimeError('source has no A_TPose clip')
    source.animation_data_create()
    source.animation_data.action = tpose
    bpy.context.scene.frame_set(0)
    s_heads, s_rots, s_tails, s_children = pose_frames(source)
    mapping = {}
    for sb in s_heads:
        tb = RENAME.get(sb, sb)
        if tb in t_heads and tb != 'Root':
            mapping[tb] = sb
    # Per bone: the rotation from the source's T-pose frame to the target's aligned frame.
    offset = {}
    for tb, sb in mapping.items():
        dt = aim(t_heads, tb, t_children, t_tails[tb])
        ds = aim(s_heads, sb, s_children, s_tails[sb])
        aligned = dt.rotation_difference(ds) @ t_rots[tb]
        offset[tb] = s_rots[sb].inverted() @ aligned
    hip_ratio = t_heads['pelvis'].z / s_heads['pelvis'].z
    s_hip_t = s_heads['pelvis'].copy()
    order = [b.name for b in target.data.bones]  # parents come before children
    parents = {b.name: (b.parent.name if b.parent else None) for b in target.data.bones}
    made = []
    for clip in clips:
        act = src_actions.get(clip)
        if not act:
            continue
        source.animation_data.action = act
        start, end = act.frame_range
        frames = [float(f) for f in range(int(start), int(end) + 1)]
        if end - frames[-1] > 0.01:
            frames.append(float(end))
        rot_keys = {b: [] for b in order}
        loc_keys = []
        for f in frames:
            bpy.context.scene.frame_set(int(f), subframe=f - int(f))
            world = {}
            for tb in order:
                sb = mapping.get(tb)
                if sb:
                    world[tb] = (source.pose.bones[sb].matrix.to_quaternion() @ offset[tb]).normalized()
                else:
                    p = parents[tb]
                    world[tb] = (world[p] @ t_rots[p].inverted() @ t_rots[tb]) if p else t_rots[tb]
                p = parents[tb]
                parent_world = world[p] if p else Quaternion()
                parent_rest = t_rots[p] if p else Quaternion()
                basis = (t_rots[tb].inverted() @ parent_rest) @ parent_world.inverted() @ world[tb]
                basis.normalize()
                prev = rot_keys[tb][-1][1] if rot_keys[tb] else None
                if prev is not None and prev.dot(basis) < 0:
                    basis.negate()
                rot_keys[tb].append((f, basis))
            head = source.pose.bones[mapping['pelvis']].head
            want = t_heads['pelvis'] + (head - s_hip_t) * hip_ratio
            loc_keys.append((f, t_rots['pelvis'].inverted() @ (want - t_heads['pelvis'])))
        action = bpy.data.actions.new(clip)
        action.use_fake_user = True
        for tb in order:
            path = f'pose.bones["{tb}"].rotation_quaternion'
            for i in range(4):
                fc = action.fcurves.new(path, index=i, action_group=tb)
                fc.keyframe_points.add(len(rot_keys[tb]))
                co = []
                for f, q in rot_keys[tb]:
                    co += [f, q[i]]
                fc.keyframe_points.foreach_set('co', co)
                for k in fc.keyframe_points:
                    k.interpolation = 'LINEAR'
        for i in range(3):
            fc = action.fcurves.new('pose.bones["pelvis"].location', index=i, action_group='pelvis')
            fc.keyframe_points.add(len(loc_keys))
            co = []
            for f, v in loc_keys:
                co += [f, v[i]]
            fc.keyframe_points.foreach_set('co', co)
            for k in fc.keyframe_points:
                k.interpolation = 'LINEAR'
        made.append(action)
        print('CLIP', clip, len(frames))
    return made


def import_source(path):
    before = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = [o for o in new if o.type == 'ARMATURE'][0]
    return arm, new, [a for a in bpy.data.actions if a not in before_actions]


def build_anims():
    reset()
    _, rig = build(CAST['vex'])
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            bpy.data.objects.remove(o)
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    actions = []
    for path in UAL:
        arm, objs, src_actions = import_source(path)
        done = [a.name for a in actions]
        actions += retarget(rig, arm, src_actions, [c for c in CLIPS if c not in done])
        for o in objs:
            bpy.data.objects.remove(o)
        for a in src_actions:
            bpy.data.actions.remove(a)
    # The exporter takes each action from an NLA track.
    rig.animation_data_create()
    rig.animation_data.action = None
    for a in actions:
        track = rig.animation_data.nla_tracks.new()
        track.name = a.name
        track.strips.new(a.name, int(a.frame_range[0]), a)
    missing = [c for c in CLIPS if c not in [a.name for a in actions]]
    if missing:
        raise RuntimeError('clips not found: ' + ', '.join(missing))
    path = os.path.join(OUT, 'anims.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
                              export_force_sampling=False, export_anim_single_armature=True, export_skins=True, export_morph=False,
                              export_yup=True, export_extras=False)
    print('ANIMS', len(actions), os.path.getsize(path))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = None
    if '--only' in argv:
        only = argv[argv.index('--only') + 1].split(',')
    os.makedirs(OUT, exist_ok=True)
    for name, spec in CAST.items():
        if only and name not in only:
            continue
        reset()
        build(spec)
        export_character(name)
    if '--skip-anims' not in argv:
        build_anims()


main()
