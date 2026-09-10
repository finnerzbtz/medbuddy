"""Build all starter outfits on the approved Blobby, sharing one skeleton."""
import bpy
import math
import sys
import json
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from asset_utils import material,ellipsoid,box,curve,surface,export_groups

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'generated';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'blender'/'blobby.blend'))
scene=bpy.context.scene
rig=bpy.data.objects['Blobby_Rig']
base=list(bpy.data.collections['01  BLOBBY · original character'].objects)
for track in rig.animation_data.nla_tracks:track.mute=True
scene.frame_set(1)
for pb in rig.pose.bones:pb.location=(0,0,0);pb.rotation_euler=(0,0,0);pb.scale=(1,1,1)
outfits=bpy.data.collections.new('05  WARDROBE · shared rig');scene.collection.children.link(outfits)
YELLOW=material('Raincoat · butter yellow',(.86,.59,.065),.35)
SOLE=material('Raincoat · sole',(.61,.38,.04),.65)
CORD=material('Drawstring · cotton',(.86,.83,.72),.85)
BUTTON=material('Fastenings · dark brass',(.065,.055,.03),.30)
WOOL=material('Sweater · oatmeal',(.55,.43,.29),.92)
STRAW=material('Hat · woven straw',(.64,.43,.19),.85)
BAND=material('Hat · natural band',(.30,.21,.11),.9)
FRAMES=material('Glasses · dark frames',(.024,.021,.016),.32)

# 256px periodic normal textures give fabric detail without modelling yarn.
def fabric(mat,name,kind):
    n=256;pixels=[]
    def height(u,v):
        if kind=='knit':
            x=u*math.tau*8;y=v*math.tau*8
            return math.sin(x+1.1*math.sin(y))*.6+math.cos(y*2)*.2
        return math.sin(u*math.tau*14)*.35+math.sin(v*math.tau*18)*.35
    for y in range(n):
        for x in range(n):
            u=x/n;v=y/n
            dx=(height(u+1/n,v)-height(u-1/n,v))*.8
            dy=(height(u,v+1/n)-height(u,v-1/n))*.8
            normal=Vector((-dx,-dy,1)).normalized()
            pixels.extend((normal.x*.5+.5,normal.y*.5+.5,normal.z*.5+.5,1))
    image=bpy.data.images.new(name,width=n,height=n);image.colorspace_settings.name='Non-Color'
    image.pixels.foreach_set(pixels);image.pack()
    nodes=mat.node_tree.nodes;tex=nodes.new('ShaderNodeTexImage');tex.image=image
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.65
    mat.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color'])
    mat.node_tree.links.new(normal.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
fabric(WOOL,'Knit · seamless 256','knit');fabric(STRAW,'Straw · seamless 256','straw')

for obj in base:
    if 'flipper' in obj.name or 'outer wrap' in obj.name:
        obj['variants']='base,glasses,frog,starlight,strawberry';obj['asset_group']='Base_wrap_arms'
    elif 'short foot' in obj.name:
        obj['variants']='base,glasses,sweater,frog,starlight,strawberry';obj['asset_group']='Base_feet'
    else:obj['variants']='all';obj['asset_group']='Core'

def skin(obj,variant,bone=None,group=None):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    obj.parent=rig;obj['variants']=variant;obj['asset_group']=group or variant
    vg={name:obj.vertex_groups.new(name=name) for name in rig.data.bones.keys()}
    for vertex in obj.data.vertices:
        if bone:vg[bone].add([vertex.index],1,'REPLACE')
        else:
            t=max(0,min(1,(vertex.co.z-.87)/.65));t=t*t*(3-2*t)
            if t<1:vg['Body'].add([vertex.index],1-t,'REPLACE')
            if t>0:vg['Head'].add([vertex.index],t,'REPLACE')
    mod=obj.modifiers.new('Shared Blobby rig','ARMATURE');mod.object=rig
    while obj.modifiers.find(mod.name)>0:bpy.ops.object.modifier_move_up(modifier=mod.name)
    return obj


def garment(name,profiles,mat,variant):
    verts=[];uvs=[];faces=[];n=48
    for j,(z,rx,ry) in enumerate(profiles):
        for i in range(n+1):
            a=i*math.tau/n
            # A high rear collar overlaps the hood; the front stays open below
            # the face rather than covering Blobby's expression like a mask.
            front_drop=.22*max(0,min(1,(z-1.09)/.34))*max(0,math.cos(a))**1.2 if variant=='raincoat' else 0
            verts.append((rx*math.sin(a),-ry*math.cos(a),z-front_drop));uvs.append((i/n*3,j/(len(profiles)-1)*2))
    for j in range(len(profiles)-1):
        for i in range(n):
            a=j*(n+1)+i;faces.append((a,a+1,a+n+2,a+n+1))
    obj=surface(name,verts,faces,mat,outfits,uvs)
    solid=obj.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=.027
    return skin(obj,variant)


garment('Sweater · body',[(.30,.53,.45),(.32,.61,.51),(.39,.72,.60),(.61,.775,.645),(.92,.79,.66),(1.13,.755,.635),(1.31,.69,.57),(1.35,.685,.565)],WOOL,'sweater')
# Rolled rib collar and hem: geometry only where it affects silhouette.
for name,z,rx,ry,r in [('Collar',1.35,.686,.566,.075),('Hem',.36,.64,.54,.052)]:
    pts=[(rx*math.sin(a*math.tau/64),-ry*math.cos(a*math.tau/64),z) for a in range(64)]
    skin(curve('Sweater · '+name,pts,r,WOOL,outfits,True),'sweater')
for sign,suffix in [(-1,'L'),(1,'R')]:
    sleeve=ellipsoid('Sweater · sleeve '+suffix,(sign*.775,-.005,.9),(.18,.22,.34),WOOL,outfits)
    sleeve.rotation_euler.y=sign*-.48
    skin(sleeve,'sweater','Arm.'+suffix)
    cuff=ellipsoid('Sweater · cuff '+suffix,(sign*.903,-.005,.655),(.185,.224,.065),WOOL,outfits)
    cuff.rotation_euler.y=sign*-.48;skin(cuff,'sweater','Arm.'+suffix)

# Continuous, softly undulating straw brim and crown.
verts=[];faces=[];uvs=[];n=64
profiles=[(0,2.27),(.12,2.26),(.30,2.17),(.46,2.03),(.59,1.91),(.70,1.86),(.92,1.83),(1.04,1.82)]
for j,(radius,z) in enumerate(profiles):
    for i in range(n+1):
        a=math.tau*i/n
        verts.append((radius*math.sin(a),radius*.84*math.cos(a),z+.024*math.sin(3*a)*(radius**2)))
        uvs.append((i/n*2,j/(len(profiles)-1)*2))
for j in range(len(profiles)-1):
    for i in range(n):
        a=j*(n+1)+i;faces.append((a,a+n+1,a+n+2,a+1))
hat=surface('Straw hat · crown and brim',verts,faces,STRAW,outfits,uvs)
solid=hat.modifiers.new('Woven brim thickness','SOLIDIFY');solid.thickness=.025
skin(hat,'sweater,glasses','Head','Shared_hat')
skin(curve('Straw hat · band',[(.59*math.sin(a*math.tau/64),.50*math.cos(a*math.tau/64),1.936) for a in range(64)],.026,BAND,outfits,True),'sweater,glasses','Head','Shared_hat')
for sign in [-1,1]:
    skin(curve('Glasses · round frame',[(sign*.24+.177*math.cos(a*math.tau/48),-.59,1.55+.185*math.sin(a*math.tau/48)) for a in range(48)],.017,FRAMES,outfits,True),'glasses','Head')
    skin(curve('Glasses · temple',[(sign*.407,-.59,1.57),(sign*.61,-.40,1.57),(sign*.64,-.05,1.50)],.014,FRAMES,outfits),'glasses','Head')
skin(curve('Glasses · bridge',[(-.063,-.60,1.58),(0,-.64,1.62),(.063,-.60,1.58)],.017,FRAMES,outfits),'glasses','Head')

garment('Raincoat · body',[(.29,.75,.63),(.31,.77,.65),(.50,.77,.65),(.84,.79,.68),(1.09,.77,.66),(1.24,.74,.64),(1.39,.70,.61),(1.43,.685,.60)],YELLOW,'raincoat')
# Hood is a surface with a real oval opening, not a face painted on a hood.
verts=[];faces=[];uvs=[];n=48;m=20
for j in range(m+1):
    # Close the rear pole and keep clearance over the broad egg and wrap.
    t=.88+(math.pi-.88)*j/m
    for i in range(n+1):
        a=math.tau*i/n
        verts.append((.82*math.sin(t)*math.sin(a),-.78*math.cos(t)-.045,1.53+.66*math.sin(t)*math.cos(a)))
        uvs.append((i/n,j/m))
for j in range(m):
    for i in range(n):
        a=j*(n+1)+i;faces.append((a,a+n+1,a+n+2,a+1))
hood=surface('Raincoat · open hood',verts,faces,YELLOW,outfits,uvs)
solid=hood.modifiers.new('Hood lining','SOLIDIFY');solid.thickness=.035
skin(hood,'raincoat','Head')
skin(curve('Raincoat · hood piping',[(.82*math.sin(.88)*math.sin(a*math.tau/64),-.78*math.cos(.88)-.045,1.53+.66*math.sin(.88)*math.cos(a*math.tau/64)) for a in range(64)],.022,YELLOW,outfits,True),'raincoat','Head')
skin(box('Raincoat · placket',(0,-.66,.74),(.055,.035,.79),YELLOW,outfits,.012),'raincoat')
for z in [.46,.70,.93]:skin(ellipsoid('Raincoat · button',(0,-.69,z),(.027,.014,.027),BUTTON,outfits,16,8),'raincoat','Body')
for sign,suffix in [(-1,'L'),(1,'R')]:
    sleeve=ellipsoid('Raincoat · sleeve '+suffix,(sign*.775,0,.90),(.18,.22,.35),YELLOW,outfits)
    sleeve.rotation_euler.y=sign*-.48;skin(sleeve,'raincoat','Arm.'+suffix)
    pocket=box('Raincoat · pocket',(sign*.40,-.565,.56),(.29,.065,.26),YELLOW,outfits,.045)
    pocket.rotation_euler.z=sign*-.52;skin(pocket,'raincoat','Body')
    skin(ellipsoid('Raincoat · pocket snap',(sign*.40,-.614,.61),(.02,.012,.02),BUTTON,outfits,16,8),'raincoat','Body')
    skin(curve('Raincoat · drawstring',[(sign*.18,-.62,1.17),(sign*.19,-.675,.99),(sign*.20,-.675,.82)],.012,CORD,outfits),'raincoat')
    skin(ellipsoid('Raincoat · cord end',(sign*.20,-.675,.82),(.021,.017,.028),CORD,outfits,16,8),'raincoat','Body')
    # The boots follow the existing feet, with flat bottoms at the same floor.
    boot=box('Raincoat · boot '+suffix,(sign*.243,-.052,.18),(.34,.42,.36),YELLOW,outfits,.10)
    skin(boot,'raincoat','Foot.'+suffix)
    sole=box('Raincoat · sole '+suffix,(sign*.243,-.074,.035),(.35,.45,.07),SOLE,outfits,.033)
    skin(sole,'raincoat','Foot.'+suffix)

# Boutique collection: low-poly pieces fitted to the original shared rig.
FERN=material('Froggy · fern velvet',(.22,.43,.18),.8)
CREAM=material('Froggy · cream eyes',(.84,.86,.58),.68)
NIGHT=material('Stargazer · twilight linen',(.21,.22,.46),.9)
GOLD=material('Stargazer · warm stars',(.86,.61,.18),.7)
BERRY=material('Strawberry · rose cotton',(.62,.19,.27),.85)
LEAF=material('Strawberry · leaf green',(.16,.34,.16),.8)
# A frog bonnet uses the proven open hood, with a new scalloped neck tie and eyes.
for original in list(outfits.objects):
    if original.name in ['Raincoat · open hood','Raincoat · hood piping']:
        ob=original.copy();ob.data=original.data.copy();outfits.objects.link(ob)
        ob.name=original.name.replace('Raincoat','Froggy');ob['variants']='frog';ob['asset_group']='frog'
        ob.data.materials.clear();ob.data.materials.append(FERN)
for sign in [-1,1]:
    skin(ellipsoid('Froggy · eye cushion',(sign*.43,-.12,2.12),(.25,.21,.23),FERN,outfits,20,12),'frog','Head')
    skin(ellipsoid('Froggy · eye',(sign*.43,-.298,2.16),(.137,.045,.12),CREAM,outfits,16,8),'frog','Head')
    skin(ellipsoid('Froggy · pupil',(sign*.43,-.337,2.16),(.05,.021,.066),FRAMES,outfits,12,8),'frog','Head')
    skin(ellipsoid('Froggy · tie',(sign*.10,-.655,1.10),(.14,.052,.072),FERN,outfits,16,8),'frog')
# A drooping nightcap, complete with a soft pompom and a star scarf.
verts=[];faces=[];n=32
profiles=[(1.92,.69,0),(2.10,.59,.03),(2.28,.42,.13),(2.43,.25,.29),(2.39,.10,.48),(2.26,.025,.59)]
for z,r,x in profiles:
    for i in range(n):
        a=i*math.tau/n;verts.append((x+r*math.sin(a),r*.82*math.cos(a),z))
for j in range(len(profiles)-1):
    for i in range(n):
        a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
faces.append(tuple((len(profiles)-1)*n+i for i in range(n)))
cap=surface('Stargazer · sleeping cap',verts,faces,NIGHT,outfits,sub=1)
skin(cap,'starlight','Head')
skin(curve('Stargazer · cap band',[(.69*math.sin(i*math.tau/48),.566*math.cos(i*math.tau/48),1.94) for i in range(48)],.045,GOLD,outfits,True),'starlight','Head')
skin(ellipsoid('Stargazer · pompom',(.60,0,2.22),(.105,.10,.12),GOLD,outfits,16,8),'starlight','Head')
skin(curve('Stargazer · scarf',[(.70*math.sin(i*math.tau/48),.59*math.cos(i*math.tau/48),1.13) for i in range(48)],.08,NIGHT,outfits,True),'starlight')
skin(box('Stargazer · scarf tail',(.35,-.62,.87),(.22,.09,.52),NIGHT,outfits,.04),'starlight')
def star(name,x,y,z,r,mat,variant,bone='Head'):
    points=[]
    for i in range(10):
        a=math.pi/2+i*math.tau/10;radius=r if i%2==0 else r*.43
        points.append((x+radius*math.cos(a),y,z+radius*math.sin(a)))
    ob=surface(name,points,[tuple(range(10))],mat,outfits,sub=0)
    solid=ob.modifiers.new('Soft star thickness','SOLIDIFY');solid.thickness=.018
    skin(ob,variant,bone)
star('Stargazer · cap star',-.22,-.48,2.18,.12,GOLD,'starlight')
star('Stargazer · scarf star',.35,-.676,.83,.08,GOLD,'starlight','Body')
# A berry beret and a rounded apron, with leaf straps and an embroidered seed pocket.
skin(ellipsoid('Strawberry · beret',(.04,0,2.06),(.76,.63,.26),BERRY,outfits,32,16),'strawberry','Head')
for i in range(5):
    a=i*math.tau/5
    leaf=ellipsoid('Strawberry · crown leaf',(.05+.12*math.sin(a),.12*math.cos(a),2.30),(.085,.20,.035),LEAF,outfits,16,8)
    leaf.rotation_euler.z=-a;skin(leaf,'strawberry','Head')
skin(curve('Strawberry · stem',[(.04,0,2.29),(.04,.02,2.40),(.09,.02,2.43)],.027,LEAF,outfits),'strawberry','Head')
skin(ellipsoid('Strawberry · apron',(0,-.56,.68),(.56,.13,.35),BERRY,outfits,32,16),'strawberry')
for sign in [-1,1]:
    skin(curve('Strawberry · strap',[(sign*.36,-.58,.76),(sign*.38,-.60,1.0),(sign*.29,-.54,1.25)],.041,LEAF,outfits),'strawberry')
skin(ellipsoid('Strawberry · pocket',(0,-.69,.65),(.19,.025,.13),CORD,outfits,20,10),'strawberry','Body')
for x,z in [(-.34,.61),(.32,.65),(-.17,.87),(.13,.91)]:
    skin(ellipsoid('Strawberry · seed',(x,-.682,z),(.013,.012,.025),GOLD,outfits,8,6),'strawberry','Body')

# Expressive looping actions on the approved shared rig. Meshes stay unchanged.
# Blender bone-local Y is the character's vertical axis.
for track in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(track)
CLIPS={'idle':97,'wave':73,'happy':73,'celebrating':97,'worried':97,
       'sick':97,'critical':97,'recovering':97,'walk_to_cushion':49,'rest':97,
       'feeding':145,'petting':73,'dance':97,'curious':97,'stretch':97,'tea':193,'tend':97,'ball':73,'window':97}
def reach_arm(suffix, direction):
    """Aim the existing arm along a body-space direction, retaining the rig."""
    pb=rig.pose.bones['Arm.'+suffix]
    local=pb.bone.matrix_local.to_3x3().inverted() @ Vector(direction)
    pb.rotation_euler=Vector((0,1,0)).rotation_difference(local.normalized()).to_euler('XYZ')

FEED=json.loads((ROOT.parent/'src/domain/feeding-motion.json').read_text())
TEA=json.loads((ROOT.parent/'src/domain/tea-motion.json').read_text())
def tea_pose(seconds):
    keys=TEA['keys']
    b=next((k for k in keys if k['time']>=seconds),keys[-1]);i=keys.index(b);a=keys[max(0,i-1)]
    u=0 if a==b else max(0,min(1,(seconds-a['time'])/(b['time']-a['time'])))
    u=u*u*(3-2*u)
    return {key:[x+(y-x)*u for x,y in zip(a[key],b[key])] if isinstance(a[key],list) else a[key]+(b[key]-a[key])*u for key in a}

def hold_tea_arm(suffix, target, weight):
    arm=rig.pose.bones['Arm.'+suffix];parent=arm.parent
    rest=parent.matrix @ parent.bone.matrix_local.inverted() @ arm.bone.matrix_local
    direction=rest.to_3x3().inverted() @ (target-rest.translation)
    aim=Vector((0,1,0)).rotation_difference(direction.normalized())
    from mathutils import Quaternion
    arm.rotation_euler=Quaternion().slerp(aim,weight).to_euler('XYZ')
    arm.scale.y=1+(direction.length/(arm.bone.length*1.08)-1)*weight

for clip,end in CLIPS.items():
    action=bpy.data.actions.new(clip);action.use_fake_user=True;rig.animation_data.action=action
    for frame in range(1,end+1,2):
        t=(frame-1)/(end-1);phase=math.tau*t;cycle=math.sin(phase)
        pulse=(1-math.cos(phase))/2
        for pb in rig.pose.bones:
            pb.location=(0,0,0);pb.rotation_euler=(0,0,0);pb.scale=(1,1,1);pb.rotation_mode='XYZ'
        root=rig.pose.bones['Root'];body=rig.pose.bones['Body'];head=rig.pose.bones['Head']
        body.scale=(1-.018*cycle,1+.026*cycle,1-.018*cycle)
        head.rotation_euler.z=.035*cycle
        blink=max(0,1-abs(t-.68)/.055)
        for suffix in ['L','R']:rig.pose.bones['Eye.'+suffix].scale.y=max(.12,1-.88*blink)
        if clip=='idle':
            root.rotation_euler.z=.025*cycle
            for suffix,sign in [('L',1),('R',-1)]:rig.pose.bones['Arm.'+suffix].rotation_euler.z=sign*(.04+.045*pulse)
        elif clip=='wave':
            rig.pose.bones['Arm.L'].rotation_euler.z=pulse*(1.18+.28*math.sin(phase*4))
            head.rotation_euler.z=.15*pulse
            body.rotation_euler.z=-.055*pulse
        elif clip in ['happy','celebrating','dance']:
            hop=max(0,math.sin(phase*2))
            root.location.y=hop*(.36 if clip=='celebrating' else .25)
            # Compensate for the lowest boot during a whole-body lean. At the
            # landing beat cycle=0, both soles return to the authored floor.
            root.location.y+=abs(cycle)*(.14 if clip=='dance' else .08)
            root.rotation_euler.z=(.21 if clip=='dance' else .10)*cycle
            if clip=='dance':root.location.x=.18*cycle;head.rotation_euler.z=-.20*cycle
            body.scale=(1+.10*(1-hop),1-.10*(1-hop),1+.07*(1-hop))
            for suffix,sign in [('L',1),('R',-1)]:
                rig.pose.bones['Arm.'+suffix].rotation_euler.z=sign*(.35+.5*pulse)
                rig.pose.bones['Foot.'+suffix].rotation_euler.x=sign*.18*cycle
        elif clip=='walk_to_cushion':
            for suffix,sign in [('L',1),('R',-1)]:
                rig.pose.bones['Foot.'+suffix].location.y=-max(0,sign*cycle)*.10
                rig.pose.bones['Foot.'+suffix].rotation_euler.x=sign*cycle*.12
                rig.pose.bones['Arm.'+suffix].rotation_euler.x=-sign*cycle*.32
            root.location.y=.028*(1-math.cos(phase*2))
            root.rotation_euler.z=.075*cycle
        elif clip=='tea':
            tea=tea_pose((frame-1)/24)
            body.scale=(1,1,1);head.rotation_euler=(tea['head'],0,0)
            body.rotation_euler.x=tea['bend']
            # Reach the same authored cup position used by the runtime prop.
            # The shoulder follows the body bend; only the existing arm is aimed.
            bpy.context.view_layer.update()
            for suffix,sign in [('L',-1),('R',1)]:
                cup=tea['cup'];grip=Vector((cup[0]+sign*.095/TEA['characterScale'],-cup[2],cup[1]-.015))
                hold_tea_arm(suffix,grip,tea['reach'])
                rig.pose.bones['Eye.'+suffix].scale.y=tea['eyes']
        elif clip=='tend':
            body.rotation_euler.x=.12*pulse
            head.rotation_euler.x=.15*pulse
            reach_arm('L',(-.05,-.45,.32+.08*pulse))
            rig.pose.bones['Arm.R'].rotation_euler.z=-.34
        elif clip=='ball':
            body.rotation_euler.z=.12*cycle
            head.rotation_euler.x=.16*pulse
            root.location.y=.06*pulse
            rig.pose.bones['Foot.L'].rotation_euler.x=.52*pulse
            rig.pose.bones['Foot.L'].location.y=-.08*pulse
            for suffix,sign in [('L',1),('R',-1)]:rig.pose.bones['Arm.'+suffix].rotation_euler.z=sign*.5*pulse
        elif clip=='window':
            head.rotation_euler.x=-.16-.08*pulse
            head.rotation_euler.z=.18*cycle
            rig.pose.bones['Arm.L'].rotation_euler.z=.5*pulse
        elif clip=='feeding':
            seconds=(frame-1)/24;keys=FEED['keys']
            b=next((k for k in keys if k['time']>=seconds),keys[-1]);i=keys.index(b);a=keys[max(0,i-1)]
            u=0 if a==b else max(0,min(1,(seconds-a['time'])/(b['time']-a['time'])))
            u=u*u*(3-2*u)
            feed={key:[x+(y-x)*u for x,y in zip(a[key],b[key])] if isinstance(a[key],list) else a[key]+(b[key]-a[key])*u for key in a}
            chew=sum(max(0,1-abs(seconds-(bite+.23))/.23) for bite in FEED['bites'])
            body.scale=(1+.045*chew,1-.04*chew,1+.045*chew)
            root.location.y=feed['hop'];head.rotation_euler=(feed['head'],0,.035*math.sin(seconds*3)*math.sin(math.pi*t))
            bpy.context.view_layer.update()
            for suffix,sign in [('L',-1),('R',1)]:
                food=feed['food'];grip=Vector((food[0]+sign*.22,-food[2],food[1]-.035))
                hold_tea_arm(suffix,grip,feed['reach'])
                rig.pose.bones['Eye.'+suffix].scale.y=feed['eyes']
        elif clip=='petting':
            head.rotation_euler.z=.28*cycle
            body.scale=(1+.09*pulse,1-.10*pulse,1+.06*pulse)
            for suffix in ['L','R']:rig.pose.bones['Eye.'+suffix].scale.y=.35-.18*pulse
        elif clip=='curious':
            head.rotation_euler.z=.20*cycle
            head.rotation_euler.y=.18*cycle
            rig.pose.bones['Arm.L'].rotation_euler.z=.24*pulse
        elif clip=='stretch':
            body.scale=(1-.045*pulse,1+.10*pulse,1-.045*pulse)
            head.rotation_euler.x=-.12*pulse
            for suffix,sign in [('L',1),('R',-1)]:
                rig.pose.bones['Arm.'+suffix].rotation_euler.z=sign*1.18*pulse
                rig.pose.bones['Eye.'+suffix].scale.y=1-.8*pulse
        elif clip=='recovering':
            head.rotation_euler.x=.13*(1-pulse)
            head.rotation_euler.z=.10*cycle
            for suffix,sign in [('L',1),('R',-1)]:rig.pose.bones['Arm.'+suffix].rotation_euler.z=sign*.25*pulse
        else:
            depth={'worried':.10,'sick':.18,'critical':.38,'rest':.30}[clip]
            head.rotation_euler.x=depth+.045*cycle
            if clip=='worried':body.rotation_euler.z=.08*cycle
            head.rotation_euler.z=.09*math.sin(phase*3) if clip=='sick' else (.065 if clip=='worried' else .03)*cycle
            body.scale=(1+depth*.18,1-depth*.22+.009*cycle,1+depth*.12)
            for suffix,sign in [('L',1),('R',-1)]:
                rig.pose.bones['Arm.'+suffix].rotation_euler.z=-sign*depth*.4
                rig.pose.bones['Eye.'+suffix].scale.y={'worried':.72,'sick':.38,'critical':.2,'rest':.12}[clip]-.06*pulse
        for pb in rig.pose.bones:
            for channel in ['location','rotation_euler','scale']:pb.keyframe_insert(data_path=channel,frame=frame,group=pb.name)
    track=rig.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,1,action);track.mute=True
rig.animation_data.action=None
for pb in rig.pose.bones:pb.location=(0,0,0);pb.rotation_euler=(0,0,0);pb.scale=(1,1,1)
scene.frame_set(1)
objects=base+list(outfits.objects)
for ob in objects:ob.hide_set(False);ob.hide_render=False
export_groups(objects,OUT/'characters-raw.glb',rig)

outfit_names=['base','glasses','sweater','raincoat','frog','starlight','strawberry']
rig['Outfit']=0
rig.id_properties_ui('Outfit').update(min=0,max=6,description='0 Base · 1 Glasses · 2 Sweater · 3 Raincoat · 4 Froggy · 5 Stargazer · 6 Strawberry')
for ob in objects:
    ob.hide_set(False)
    allowed=ob.get('variants','all')
    if allowed=='all':continue
    indices=[str(i) for i,name in enumerate(outfit_names) if name in allowed.split(',')]
    for prop in ['hide_render','hide_viewport']:
        driver=ob.driver_add(prop).driver;driver.type='SCRIPTED'
        variable=driver.variables.new();variable.name='outfit';variable.type='SINGLE_PROP'
        variable.targets[0].id=rig;variable.targets[0].data_path='["Outfit"]'
        driver.expression='not ('+' or '.join('outfit == '+i for i in indices)+')'
def variant(name):
    rig['Outfit']=outfit_names.index(name);rig.update_tag();scene.frame_set(scene.frame_current)
notes=bpy.data.texts.new('READ ME · Wardrobe controls')
notes.write('Select Blobby_Rig. Object Properties > Custom Properties > Outfit: 0 base, 1 glasses, 2 sweater, 3 raincoat, 4 frog, 5 starlight, 6 strawberry. Visibility drivers switch all pieces together. All outfits share the same nine-bone skeleton. In the NLA editor, unmute exactly one animation track. The app supplies a room navigation controller. Tea uses the shared src/domain/tea-motion.json timeline for pickup, two sips, and return to the saucer; the cup and hand grips stay aligned. Ball and window actions work with interactive room props. The home garden activity uses GardenCutscene.tsx, an outfit-aware SVG close-up; the tend clip is a standalone rig gesture. Source objects remain separate and editable; export copies merge by visibility group. GLB compression and budgets run with npm run assets:optimize and npm run assets:check. Save manual edits under a new filename before regenerating.')
variant('base');rig.animation_data.nla_tracks[0].mute=False;scene.frame_set(1)
scene.camera.data.ortho_scale=3.05
scene.camera.location=(-3.4,-7,2.78)
from asset_utils import aim
aim(scene.camera,(0,0,1.12))
scene.render.resolution_x=800;scene.render.resolution_y=800;scene.cycles.samples=32
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'wardrobe.blend'))
if '--render' in sys.argv or '--render-new' in sys.argv:
    for name in (outfit_names[4:] if '--render-new' in sys.argv else outfit_names):
        variant(name);scene.render.filepath=str(OUT/f'{name}.png');bpy.ops.render.render(write_still=True)
print('WARDROBE_OK',json.dumps({'meshes':len(objects),'clips':[t.name for t in rig.animation_data.nla_tracks]}))
