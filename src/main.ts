import{createScene,type Prize}from"./render/scene";
type Toy=Prize&{ox:number;oy:number;oz:number;awake:boolean};
const canvas=document.querySelector<HTMLCanvasElement>("#game")!,scoreEl=document.querySelector("#score")!,triesEl=document.querySelector("#tries")!,message=document.querySelector<HTMLElement>("#message")!,overlay=document.querySelector<HTMLElement>(".overlay")!,sub=document.querySelector<HTMLElement>("#sub")!,toast=document.querySelector<HTMLElement>("#toast")!,muteEl=document.querySelector<HTMLElement>("#mute")!,keys:Record<string,boolean>={};
const points=[100,200,500,1000,5000],radius=[.53,.54,.56,.55,.58],layout=[[-3.6,-2.55,-1.8,18,0],[-1.9,-2.45,-1.45,-12,0],[.1,-2.35,-1.7,8,3],[2.1,-2.4,-1.55,17,1],[3.65,-2.55,-1.3,165,0],[-3.1,-2.55,.05,-155,1],[-1.25,-2.5,.1,8,2],[.45,-2.48,-.05,-8,4],[2.2,-2.55,.05,175,0],[3.55,-2.55,.25,160,2],[-2.45,-2.62,1.55,-15,0],[-.25,-2.55,1.5,12,1],[2.2,-2.62,1.65,165,0]]as const;
let toys:Toy[]=[],scene:ReturnType<typeof createScene>,built=false,phase=0,time=0,score=0,tries=5,clawX=0,clawY=2.3,clawZ=0,fromX=0,fromZ=0,vx=0,vz=0,last=performance.now(),muted=false,won=false,drag=false,pointerX=0,pointerY=0,camYaw=25,camPitch=14,audio:AudioContext|undefined;
const ease=(t:number)=>t*t*(3-2*t),clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const resize=()=>{const d=Math.min(devicePixelRatio,2);canvas.width=innerWidth*d;canvas.height=innerHeight*d};
function hud(){scoreEl.textContent=`SCORE ${score}`;triesEl.innerHTML=`TRIES ${Array.from({length:5},(_,i)=>`<i class="${i<tries?"on":""}"></i>`).join("")}`}
function tone(f:number,d=.12,type:OscillatorType="sine"){if(muted)return;audio||=new AudioContext;const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*1.35,t+d);g.gain.setValueAtTime(.09,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+d)}
function reset(){score=0;tries=5;phase=time=0;clawX=clawZ=vx=vz=0;clawY=2.3;const spots=layout.map(p=>[p[0],p[1],p[2]]);for(let i=12;i;i--){const j=Math.random()*(i+1)|0,t=spots[i]!;spots[i]=spots[j]!;spots[j]=t}toys=layout.map((p,i)=>{const s=spots[i]! as[number,number,number],x=s[0]+(Math.random()-.5)*.22,y=s[1],z=s[2]+(Math.random()-.5)*.18,yaw=Math.random()*360;return{x,y,z,yaw,rarity:p[4],state:0,ox:x,oy:y,oz:z,awake:false}});if(built)toys.forEach((p,i)=>scene.movePrize(i,p.x,p.y,p.z,p.yaw));else{scene=createScene(canvas,toys);built=true}hud();message.textContent="UNICORN CLAW";sub.textContent="WASD / ARROWS: AIM  •  DRAG: LOOK  •  SPACE: START";overlay.classList.remove("hidden")}
function start(){if(phase===9){reset();return}if(phase)return;phase=1;time=0;overlay.classList.add("hidden");tone(420)}
function drop(){if(phase===1){phase=2;time=0;vx=vz=0;won=false;toast.classList.remove("show");tone(170,.25,"sawtooth")}else start()}
function capsule(p:Toy,ax:number,ay:number,az:number,bx:number,by:number,bz:number,r:number){
  const abx=bx-ax,aby=by-ay,abz=bz-az,apx=p.x-ax,apy=p.y-ay,apz=p.z-az,q=clamp((apx*abx+apy*aby+apz*abz)/(abx*abx+aby*aby+abz*abz),0,1),cx=ax+abx*q,cy=ay+aby*q,cz=az+abz*q,dx=p.x-cx,dy=p.y-cy,dz=p.z-cz,d=Math.hypot(dx,dy,dz),hit=radius[p.rarity]!+r-d;
  if(hit<=0)return false;const n=d>.001?1/d:1;p.x+=dx*n*hit;p.y+=dy*n*hit;p.z+=dz*n*hit;p.awake=true;return true;
}
function physics(dt:number,close:number,clawActive:boolean){
  const steps=3,h=dt/steps;
  for(let s=0;s<steps;s++){
    for(const p of toys)if(!p.state&&p.awake){const x=p.x,y=p.y,z=p.z;p.x+=(p.x-p.ox)*.992;p.y+=(p.y-p.oy)*.992-9*h*h;p.z+=(p.z-p.oz)*.992;p.ox=x;p.oy=y;p.oz=z}
    if(clawActive){
      const phi=.85-close*.4,py=clawY-.12;
      for(const p of toys)if(!p.state){let dx=p.x-clawX,dz=p.z-clawZ,d=Math.hypot(dx,dz),inside=d<.82&&p.y<clawY-.75&&p.y>clawY-1.95,contacts=0;for(let j=0;j<3;j++){const a=j*Math.PI*2/3,ux=Math.cos(a),uz=Math.sin(a),ex=clawX+ux*.75*Math.sin(phi),ey=py-.75*Math.cos(phi),ez=clawZ+uz*.75*Math.sin(phi),tx=ex+ux*.9*Math.sin(phi-.4),ty=ey-.9*Math.cos(phi-.4),tz=ez+uz*.9*Math.sin(phi-.4);contacts+=+capsule(p,clawX,py,clawZ,ex,ey,ez,.1);contacts+=+capsule(p,ex,ey,ez,tx,ty,tz,.12)}capsule(p,clawX,clawY-.72,clawZ,clawX,clawY-.38,clawZ,.11);if(close>.55&&inside){dx=p.x-clawX;dz=p.z-clawZ;d=Math.hypot(dx,dz);const wall=.68-close*.25;if(d>wall){p.x=clawX+dx/d*wall;p.z=clawZ+dz/d*wall}if(close>.72&&p.y<clawY-1.08){const q=clawY-1.08-p.y;p.y+=q;p.oy+=q}p.awake=true}if(contacts>1){p.ox+=(p.x-p.ox)*.16;p.oz+=(p.z-p.oz)*.16}}
    }
    for(let i=0;i<toys.length;i++){const p=toys[i]!;if(p.state||!p.awake)continue;
      const r=radius[p.rarity]!,hole=p.x>-5&&p.x<-2.75&&p.z>1.75&&p.z<3.45;if(!hole){p.x=clamp(p.x,-4.55+r,4.55-r);p.z=clamp(p.z,-2.6+r,2.58-r)}if(!hole&&p.y<-2.58){p.y=-2.58;p.oy=p.y+(p.y-p.oy)*-.08;p.ox=p.x-(p.x-p.ox)*.72;p.oz=p.z-(p.z-p.oz)*.72}if(hole&&p.y<-3.45&&phase===6){win(i);continue}scene.movePrize(i,p.x,p.y,p.z,p.yaw,clamp((p.ox-p.x)*70,-32,32))}
  }
}
function win(i:number){const p=toys[i]!;if(p.state)return;p.state=2;won=true;score+=points[p.rarity]!;scene.movePrize(i,0,-20,0);toast.textContent=`+${points[p.rarity]}`;toast.classList.add("show");scene.celebrate(-3.9,-1.5,2.4,.7);hud();tone(p.rarity>2?880:620,.4,"triangle")}
function settle(){tries--;hud();if(!won){toast.textContent="MISSED!";toast.classList.add("show")}if(!tries){phase=9;message.textContent=score>=5000?"JACKPOT!":score>=1000?"GREAT HAUL!":"GAME OVER";sub.textContent=`${score} POINTS  •  SPACE / R TO PLAY AGAIN`;overlay.classList.remove("hidden");tone(score>=1000?660:180,.5,"triangle")}else{phase=1;clawX=clawZ=0;clawY=2.3}}
function update(dt:number){
  time+=dt;let close=0,active=false;
  if(phase===1){let x=+(!!(keys.ArrowRight||keys.KeyD))-+(!!(keys.ArrowLeft||keys.KeyA)),z=+(!!(keys.ArrowDown||keys.KeyS))-+(!!(keys.ArrowUp||keys.KeyW));if(x&&z){x*=.707;z*=.707}vx=(vx+x*dt*8)*Math.pow(.02,dt);vz=(vz+z*dt*8)*Math.pow(.02,dt);clawX=clamp(clawX+vx*dt,-3.8,3.8);clawZ=clamp(clawZ+vz*dt,-1.8,1.8)}
  else if(phase===2){clawY=2.3-ease(Math.min(1,time/.85))*3.45;if(time>.85){phase=3;time=0;tone(95,.16,"square")}}
  else if(phase===3){close=ease(Math.min(1,time/.45));active=true;if(time>.48){phase=4;time=0}}
  else if(phase===4){close=1;active=true;clawY=-1.15+ease(Math.min(1,time/1.15))*3.45;if(time>1.15){phase=5;time=0;fromX=clawX;fromZ=clawZ}}
  else if(phase===5){close=1;active=true;const t=ease(Math.min(1,time/.9));clawX=fromX+(-3.9-fromX)*t;clawZ=fromZ+(2.55-fromZ)*t;if(time>.9){phase=6;time=0}}
  else if(phase===6){close=1-ease(Math.min(1,time/.25));active=time<.3;if(time>1.25){phase=7;time=0;fromX=clawX;fromZ=clawZ}}
  else if(phase===7){const t=ease(Math.min(1,time/.9));clawX=fromX*(1-t);clawZ=fromZ*(1-t);if(time>.9){phase=8;time=0}}
  else if(phase===8&&time>.25){toast.classList.remove("show");scene.hideSparks();settle()}
  physics(dt,close,active);scene.moveClaw(clawX,clawY,clawZ,close)
}
addEventListener("keydown",e=>{keys[e.code]=true;if(["Space","Enter"].includes(e.code)){e.preventDefault();drop()}if(e.code==="KeyR"&&phase===9)reset();if(e.code==="KeyM"){muted=!muted;muteEl.textContent=muted?"🔇":"♪"}});addEventListener("keyup",e=>keys[e.code]=false);canvas.addEventListener("pointerdown",e=>{drag=true;pointerX=e.clientX;pointerY=e.clientY;canvas.setPointerCapture(e.pointerId)});canvas.addEventListener("pointermove",e=>{if(!drag)return;camYaw=clamp(camYaw+(e.clientX-pointerX)*.16,-55,55);camPitch=clamp(camPitch+(e.clientY-pointerY)*.12,7,32);pointerX=e.clientX;pointerY=e.clientY;scene.moveCamera(camYaw,camPitch)});canvas.addEventListener("pointerup",()=>drag=false);canvas.addEventListener("pointercancel",()=>drag=false);addEventListener("resize",resize);resize();reset();requestAnimationFrame(function loop(now){const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);requestAnimationFrame(loop)});
