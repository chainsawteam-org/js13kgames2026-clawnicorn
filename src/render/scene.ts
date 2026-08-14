export type Prize = { x:number;y:number;z:number;yaw:number;rarity:number;state:number };
const PINK="#e6327d",DARK="#8d1749",WHITE="#fff7fd",GOLD="#ffc83d";
const body=[WHITE,"#ff83b6",GOLD,WHITE,"#fff0df"],mane=["#78dfcd","#ed5c9b","#f19b22","#72cbe7","#9866df"];
const cube=(n:string,g:string,x:number,y:number,z:number,w:number,h:number,d:number,b:string,extra:WSettings={})=>W.cube({n,g,x,y,z,w,h,d,b,...extra});

export function createScene(canvas:HTMLCanvasElement,prizes:Prize[]){
  W.reset(canvas);W.clearColor("#f9b2d3");const narrow=canvas.width/canvas.height<1.15,camDistance=narrow?16:12;W.camera({x:Math.sin(25*Math.PI/180)*camDistance,y:Math.sin(14*Math.PI/180)*camDistance,z:Math.cos(25*Math.PI/180)*camDistance,rx:-14,ry:25,fov:30});W.light({x:-1,y:-1,z:-.5});W.ambient(.62);
  W.group({n:"machine"});
  cube("floor","machine",0,-3.45,0,10.4,.45,6.8,DARK);cube("back","machine",0,.2,-3.25,10.4,7.1,.25,"#a51e52");cube("roof","machine",0,4.5,0,11,.8,7.2,PINK);
  for(const x of [-5.2,5.2])for(const z of [-3.2,3.2])cube(`post${x}${z}`,"machine",x,.35,z,.45,8.1,.45,PINK);
  cube("front","machine",0,-4.05,3.35,10.8,1.45,.7,PINK,{rx:-8});cube("chute","machine",-3.9,-3.16,2.6,2.15,.08,1.55,"#21091e");cube("chuteBack","machine",-3.9,-3.2,1.84,2.25,.28,.14,"#ff69a8");cube("chuteL","machine",-5,-3.18,2.6,.18,.72,1.7,"#f15a9a");cube("chuteR","machine",-2.8,-3.18,2.6,.18,.72,1.7,"#f15a9a");
  cube("shine1","machine",-4.65,1.4,3.17,.12,1.5,.06,WHITE,{rz:-28});cube("shine2","machine",4.75,-.5,3.17,.1,1.1,.06,WHITE,{rz:-28});
  prizes.forEach((p,i)=>makeUnicorn(i,p));
  W.group({n:"claw",x:0,y:2.3,z:0});W.sphere({n:"clawHub",g:"claw",w:.7,h:.58,d:.7,b:PINK});cube("plunger","claw",0,-.38,0,.14,.38,.14,"#d7cbd5");
  for(let i=0;i<3;i++){const j=`jaw${i}`;W.group({n:j,g:"claw",ry:i*120});cube(`${j}a`,j,.25,-.4,0,.17,.75,.17,"#712047");cube(`${j}b`,j,.55,-.95,0,.17,.9,.17,"#712047");W.sphere({n:`${j}t`,g:j,x:.7,y:-1.35,size:.23,b:"#712047"})}cube("cable","machine",0,3.45,0,.08,2.2,.08,"#ddd6e1");
  W.group({n:"reticle"});for(let i=0;i<4;i++)cube(`r${i}`,"reticle",i<2?(i*2-1)*.65:0,-3.12,i>1?(i*2-5)*.65:0,i<2?.45:.12,.04,i<2?.12:.45,WHITE);
  for(let i=0;i<10;i++)W.cube({n:`spark${i}`,x:0,y:-20,z:0,size:.12,b:["#fff","#55ddeb","#ffc83d","#ff75bd"][i%4]});
  return{
    moveCamera(yaw:number,pitch:number){const a=yaw*Math.PI/180,b=pitch*Math.PI/180;W.move({n:"camera",x:Math.sin(a)*camDistance,y:Math.sin(b)*camDistance,z:Math.cos(a)*camDistance,rx:-pitch,ry:yaw})},
    moveClaw(x:number,y:number,z:number,close:number){W.move({n:"claw",x,y,z});W.move({n:"cable",x,y:(4.25+y)/2,z,h:4.25-y});const a=.85-close*.4,c=a-.4,ex=.75*Math.sin(a),ey=-.12-.75*Math.cos(a),tx=ex+.9*Math.sin(c),ty=ey-.9*Math.cos(c);for(let i=0;i<3;i++){const j=`jaw${i}`;W.move({n:`${j}a`,x:ex/2,y:(ey-.12)/2,rz:a*57.3});W.move({n:`${j}b`,x:(ex+tx)/2,y:(ey+ty)/2,rz:c*57.3});W.move({n:`${j}t`,x:tx,y:ty})}W.move({n:"reticle",x,z})},
    movePrize(i:number,x:number,y:number,z:number,ry?:number,rz=0){W.move({n:`u${i}`,x,y,z,rz,...(ry==null?{}:{ry})})},
    celebrate(x:number,y:number,z:number,t:number){for(let i=0;i<10;i++){const a=i*.628;W.move({n:`spark${i}`,x:x+Math.cos(a)*t*2,y:y+Math.sin(a)*t*1.8-t*t*1.5,z:z+(i%3-1)*t})}},
    hideSparks(){for(let i=0;i<10;i++)W.move({n:`spark${i}`,y:-20})}
  }
}
function makeUnicorn(i:number,p:Prize){const g=`u${i}`,b=body[p.rarity]!,m=mane[p.rarity]!;W.group({n:g,x:p.x,y:p.y,z:p.z,ry:p.yaw});W.sphere({n:`${g}b`,g,w:1.25,h:1.15,d:.9,b});W.sphere({n:`${g}h`,g,x:.62,y:.55,w:.8,h:.78,d:.72,b});W.sphere({n:`${g}m`,g,x:.98,y:.38,w:.45,h:.34,d:.62,b:p.rarity===1?"#ff9fc5":WHITE});
  for(const z of[-.35,.35]){cube(`${g}l${z}`,g,-.35,-.56,z,.32,.38,.3,b,{rz:8});cube(`${g}f${z}`,g,.38,-.55,z,.3,.36,.28,b,{rz:-8})}W.pyramid({n:`${g}horn`,g,x:.7,y:1.18,z:0,size:.34,h:.72,b:GOLD});cube(`${g}eye1`,g,.99,.7,.29,.09,.12,.08,"#27131e");cube(`${g}eye2`,g,.99,.7,-.29,.09,.12,.08,"#27131e");
  for(let q=0;q<3;q++)W.sphere({n:`${g}mane${q}`,g,x:.15-q*.23,y:.77-q*.16,z:0,size:.42,b:p.rarity===3?["#55ddeb","#ffc83d","#9b65e6"][q]:m});W.sphere({n:`${g}tail`,g,x:-.75,y:.1,size:.4,b:m});if(p.rarity===4){cube(`${g}crown`,g,.1,1.12,0,.65,.18,.5,GOLD);for(let q=-1;q<2;q++)W.pyramid({n:`${g}c${q}`,g,x:.1,y:1.35,z:q*.2,size:.22,b:GOLD})}}
