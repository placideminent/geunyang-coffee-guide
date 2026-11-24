/* 내 분쇄도 측정하기 — client-side canvas analysis
   Sheet detection uses js-aruco2 (MIT License):
   Copyright (c) 2020 Damiano Falcioni, Copyright (c) 2011 Juan Mellado.
   See js/vendor/LICENSE-js-aruco2.txt
*/
(function(){
var COIN_MM=24, MAX_SRC=5000, MAX_DETECT=1600, MAX_WARP_W=1400, MIN_UM=150, AXIS_MAX=1600;
/* 선형 크기 보정. 실측이 약 15% 크게 나와 SIZE_CAL=0.87. 용지·동전 경로에 동일하게 적용. MIN_UM 등 임계값은 보정 후 단위. */
var SIZE_CAL=0.87;
var FINES_RATIO=0.35, FINES_FLOOR_UM=150, FINES_VALLEY_LO=0.2, FINES_VALLEY_HI=0.5, MIN_COARSE_COUNT=10, FINES_AREA_FALLBACK=0.80;
/* 표시용 히스토그램: 로그 구간. 100–2500µm, 24구간, 공비 5^(1/12)≈1.1435
   (언스페셜티 가이드 눈금 공비 5^(1/4)≈1.4954를 3등분). 약 17구간/decade. */
var HIST_LOG_MIN=100, HIST_LOG_MAX=2500, HIST_LOG_BINS=24, HIST_LOG_TICKS=[150,300,600,1000,2000];
/* 균일도 = (전체 입자 양 중앙값, 미분 포함=대표 입자크기)/(미분 제외 개수 중앙값).
   임계값은 잠정값(앱에 업계 기준으로 표시하지 않음). ≤1.3 균일한 편(1 미만 포함), ≤1.6 보통, >1.6 불균일. */
var UNIFORM_RATIO_EVEN=1.3, UNIFORM_RATIO_OK=1.6;
var FINE_MEASURE_NOTE='모카포트보다 고운 분쇄도(에스프레소 등)는 수치 측정이 어렵습니다.';
var SHEET={wmm:148.5, hmm:210, markerMm:10, insetMm:12, quietMm:10/7, spanX:114.5, spanY:176.0, roi:{x:27.5,y:57.8,w:93.5,h:136.2}, ids:{TL:0,TR:1,BR:2,BL:3}};
var RANGES=[
  {name:'에스프레소', lo:200, hi:400, color:'#EED9CC'},
  {name:'모카포트', lo:360, hi:660, color:'#F5EBCD'},
  {name:'핸드드립', lo:600, hi:1250, color:'#E2E8DC'},
  {name:'프렌치프레스', lo:1250, hi:1600, color:'#D4E4F1'}
];
var S={phase:'guide', canvas:null, coin:null, auto:false, result:null, drag:null, mode:null, sheet:null, rectified:null};

function gEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}
function gTop(t){return '<div class="top"><button class="back" onclick="appBack(\'#/\')">← 뒤로</button><h1>'+gEsc(t)+'</h1></div>'}
function $(id){return document.getElementById(id)}
function appEl(){return document.getElementById('app')}
function roundum(v){return Math.round(v/10)*10}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

function toGray(imgData){
  var d=imgData.data, n=imgData.width*imgData.height, g=new Uint8ClampedArray(n);
  for(var i=0,j=0;i<d.length;i+=4,j++) g[j]=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114+0.5)|0;
  return g;
}
function otsu(gray){
  var hist=new Int32Array(256), i, n=gray.length;
  for(i=0;i<n;i++) hist[gray[i]]++;
  var sum=0; for(i=0;i<256;i++) sum+=i*hist[i];
  var sumB=0, wB=0, wF, max=0, th=128, total=n, mB, mF, between;
  for(i=0;i<256;i++){
    wB+=hist[i]; if(!wB) continue;
    wF=total-wB; if(!wF) break;
    sumB+=i*hist[i];
    mB=sumB/wB; mF=(sum-sumB)/wF;
    between=wB*wF*(mB-mF)*(mB-mF);
    if(between>=max){max=between; th=i}
  }
  return th;
}
function otsuOn(gray, pick){
  var hist=new Int32Array(256), i, n=0;
  if(pick){
    for(i=0;i<gray.length;i++) if(pick[i]){ hist[gray[i]]++; n++; }
  }else{
    n=gray.length;
    for(i=0;i<n;i++) hist[gray[i]]++;
  }
  if(n<32) return otsu(gray);
  var sum=0; for(i=0;i<256;i++) sum+=i*hist[i];
  var sumB=0, wB=0, wF, max=0, th=128, total=n, mB, mF, between;
  for(i=0;i<256;i++){
    wB+=hist[i]; if(!wB) continue;
    wF=total-wB; if(!wF) break;
    sumB+=i*hist[i];
    mB=sumB/wB; mF=(sum-sumB)/wF;
    between=wB*wF*(mB-mF)*(mB-mF);
    if(between>=max){max=between; th=i}
  }
  return th;
}
function statsOf(arr){
  var n=arr.length, mean=0, median=0, i;
  if(!n) return {mean:0, median:0, count:0};
  for(i=0;i<n;i++) mean+=arr[i].um;
  mean/=n;
  median=n%2?arr[(n-1)>>1].um:(arr[n/2-1].um+arr[n/2].um)/2;
  return {mean:mean, median:median, count:n};
}
function areaDx(parts, p){
  var i, total=0, acc=0;
  if(!parts||!parts.length) return 0;
  for(i=0;i<parts.length;i++) total+=parts[i].area;
  if(!total) return parts[(parts.length-1)>>1].um;
  var target=total*p;
  for(i=0;i<parts.length;i++){
    acc+=parts[i].area;
    if(acc>=target) return parts[i].um;
  }
  return parts[parts.length-1].um;
}
function areaD50(parts){ return areaDx(parts, 0.5); }
function uniformityLabel(ratio){
  return ratio<=UNIFORM_RATIO_EVEN?'균일한 편':(ratio<=UNIFORM_RATIO_OK?'보통':'불균일');
}
function uniformityOf(areaMedAll, countMedCoarse){
  if(!(countMedCoarse>0)) return {ratio:0, label:'', areaMedian:areaMedAll||0, countMedian:0};
  var ratio=areaMedAll/countMedCoarse;
  return {ratio:ratio, label:uniformityLabel(ratio), areaMedian:areaMedAll, countMedian:countMedCoarse};
}
function areaWeightedMean(parts){
  var i, ta=0, s=0;
  if(!parts||!parts.length) return 0;
  for(i=0;i<parts.length;i++){ s+=parts[i].um*parts[i].area; ta+=parts[i].area; }
  return ta?s/ta:0;
}
function bimodalValley(parts, d50){
  var i, j, n=parts?parts.length:0, total=0, maxUm=0;
  if(n<8||!d50) return 0;
  for(i=0;i<n;i++){ total+=parts[i].area; if(parts[i].um>maxUm) maxUm=parts[i].um; }
  if(!total) return 0;
  var binW=50, nBin=Math.max(8, Math.ceil(Math.max(1800, maxUm+binW)/binW));
  var hist=new Float64Array(nBin), sm=new Float64Array(nBin);
  for(i=0;i<n;i++){
    j=Math.min(nBin-1, Math.max(0, (parts[i].um/binW)|0));
    hist[j]+=parts[i].area;
  }
  for(i=0;i<nBin;i++){
    var a=hist[i?i-1:i], b=hist[i], c=hist[i<nBin-1?i+1:i];
    sm[i]=(a+b+c)/3;
  }
  var peaks=[], last=sm[0];
  for(i=1;i<nBin-1;i++){
    if(sm[i]>=sm[i-1]&&sm[i]>=sm[i+1]&&sm[i]>last){
      if(sm[i]>=total*0.06) peaks.push({i:i, h:sm[i], um:(i+0.5)*binW});
    }
    last=sm[i];
  }
  if(peaks.length<2) return 0;
  // keep peaks separated by >= 2 bins
  var kept=[peaks[0]];
  for(i=1;i<peaks.length;i++){
    if(peaks[i].i-kept[kept.length-1].i>=2) kept.push(peaks[i]);
    else if(peaks[i].h>kept[kept.length-1].h) kept[kept.length-1]=peaks[i];
  }
  if(kept.length<2) return 0;
  // pair the lowest peak below D50 with the next higher peak
  var lo=null, hi=null;
  for(i=0;i<kept.length;i++){
    if(kept[i].um<d50 && (!lo||kept[i].h>lo.h)) lo=kept[i];
  }
  if(!lo) lo=kept[0];
  for(i=0;i<kept.length;i++){
    if(kept[i].i>lo.i && (!hi||kept[i].h>hi.h)) hi=kept[i];
  }
  if(!hi) return 0;
  var minH=1e18, minI=lo.i, flatFrom=lo.i, flatTo=lo.i;
  for(i=lo.i+1;i<hi.i;i++){
    if(sm[i]<minH-1e-9){ minH=sm[i]; minI=i; flatFrom=i; flatTo=i; }
    else if(Math.abs(sm[i]-minH)<=1e-9){ flatTo=i; }
  }
  if(minH>0.55*Math.min(lo.h, hi.h)) return 0;
  if(hi.um-lo.um<150) return 0;
  var valley=((flatFrom+flatTo+1)/2)*binW;
  return valley;
}
function finesCutoffOf(parts){
  var d50=areaD50(parts);
  var ratioCut=Math.max(FINES_FLOOR_UM, FINES_RATIO*d50);
  var valley=bimodalValley(parts, d50);
  if(valley && valley>=FINES_VALLEY_LO*d50 && valley<=FINES_VALLEY_HI*d50){
    return {um:Math.max(FINES_FLOOR_UM, valley), method:'valley', d50:d50, ratioCut:ratioCut};
  }
  return {um:ratioCut, method:'ratio', d50:d50, ratioCut:ratioCut};
}
function histEdges(){
  var n=HIST_LOG_BINS, lo=HIST_LOG_MIN, hi=HIST_LOG_MAX, edges=[], i;
  for(i=0;i<=n;i++) edges.push(lo*Math.pow(hi/lo, i/n));
  return edges;
}
function histTickLeft(v, a, b){
  if(!(v>0) || !(a>0) || !(b>a)) return 0;
  var t=(Math.log(v)-Math.log(a))/(Math.log(b)-Math.log(a));
  return Math.max(0, Math.min(100, t*100));
}
function boxBlur(src,w,h,r){
  r=Math.max(1,r|0);
  var k=2*r+1, n=w*h;
  var tmp=new Float64Array(n), out=new Uint8ClampedArray(n);
  var x,y,acc,add,sub;
  for(y=0;y<h;y++){
    acc=0;
    for(x=-r;x<=r;x++) acc+=src[y*w+Math.max(0,Math.min(w-1,x))];
    for(x=0;x<w;x++){
      tmp[y*w+x]=acc;
      add=src[y*w+Math.min(w-1,x+r+1)];
      sub=src[y*w+Math.max(0,x-r)];
      acc+=add-sub;
    }
  }
  for(x=0;x<w;x++){
    acc=0;
    for(y=-r;y<=r;y++) acc+=tmp[Math.max(0,Math.min(h-1,y))*w+x];
    for(y=0;y<h;y++){
      out[y*w+x]=(acc/(k*k)+0.5)|0;
      add=tmp[Math.min(h-1,y+r+1)*w+x];
      sub=tmp[Math.max(0,y-r)*w+x];
      acc+=add-sub;
    }
  }
  return out;
}
function normalizeIllum(gray,w,h){
  var r=Math.max(16, Math.round(Math.min(w,h)/18));
  var ill=boxBlur(gray,w,h,r), out=new Uint8ClampedArray(w*h), i, v;
  for(i=0;i<gray.length;i++){
    v=ill[i]<8?8:ill[i];
    out[i]=Math.max(0, Math.min(255, (gray[i]*140/v+0.5)|0));
  }
  return out;
}
function labelsOf(mask,w,h){
  var N=w*h, parent=new Int32Array(N);
  for(var i=0;i<N;i++) parent[i]=i;
  function find(a){while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a]}return a}
  function uni(a,b){a=find(a);b=find(b);if(a!==b) parent[b]=a}
  var x,y,i;
  for(y=0;y<h;y++){
    for(x=0;x<w;x++){
      i=y*w+x; if(!mask[i]) continue;
      if(x>0&&mask[i-1]) uni(i,i-1);
      if(y>0&&mask[i-w]) uni(i,i-w);
      if(x>0&&y>0&&mask[i-w-1]) uni(i,i-w-1);
      if(x+1<w&&y>0&&mask[i-w+1]) uni(i,i-w+1);
    }
  }
  var map={}, comps=[], c;
  for(i=0;i<N;i++){
    if(!mask[i]) continue;
    var r=find(i); c=map[r];
    if(!c){c=map[r]={area:0,sumX:0,sumY:0,minX:w,minY:h,maxX:0,maxY:0}; comps.push(c); map[r]=c}
    x=i%w; y=(i/w)|0;
    c.area++; c.sumX+=x; c.sumY+=y;
    if(x<c.minX)c.minX=x; if(y<c.minY)c.minY=y;
    if(x>c.maxX)c.maxX=x; if(y>c.maxY)c.maxY=y;
  }
  for(i=0;i<comps.length;i++){c=comps[i]; c.cx=c.sumX/c.area; c.cy=c.sumY/c.area; c.bw=c.maxX-c.minX+1; c.bh=c.maxY-c.minY+1}
  return comps;
}
function detectCoin(gray,w,h){
  var scale=Math.max(1, Math.round(Math.min(w,h)/640));
  var dw=(w/scale)|0, dh=(h/scale)|0;
  var small=new Uint8ClampedArray(dw*dh), x,y,i;
  for(y=0;y<dh;y++){
    var sy=Math.min(h-1,y*scale), row=sy*w;
    for(x=0;x<dw;x++) small[y*dw+x]=gray[row+Math.min(w-1,x*scale)];
  }
  var th0=otsu(small);
  var tries=[th0, 200, 220, 240, Math.min(250, th0+15), Math.max(160, th0-10)];
  var seen={}, best=null, bestScore=-1, t, c, k;
  for(k=0;k<tries.length;k++){
    t=tries[k]|0; if(seen[t]) continue; seen[t]=1;
    var mask=new Uint8Array(dw*dh);
    for(i=0;i<small.length;i++) mask[i]=small[i]<t?1:0;
    var comps=labelsOf(mask,dw,dh);
    var minArea=dw*dh*0.004, maxArea=dw*dh*0.5;
    for(i=0;i<comps.length;i++){
      c=comps[i];
      if(c.area<minArea||c.area>maxArea) continue;
      var aspect=Math.min(c.bw,c.bh)/Math.max(c.bw,c.bh);
      if(aspect<0.72) continue;
      var r=Math.sqrt(c.area/Math.PI);
      var fill=c.area/(Math.PI*Math.pow(Math.max(c.bw,c.bh)/2,2));
      if(fill<0.55) continue;
      var score=c.area*aspect*fill;
      if(score>bestScore){
        bestScore=score;
        best={cx:(c.cx+0.5)*scale, cy:(c.cy+0.5)*scale, r:r*scale, fill:fill, aspect:aspect, area:c.area*(scale*scale), auto:true, threshold:t};
      }
    }
  }
  return best;
}

function downsampleGray(gray,w,h,dw,dh){
  var small=new Uint8ClampedArray(dw*dh), x,y,sx,sy,row;
  var scx=w/dw, scy=h/dh;
  for(y=0;y<dh;y++){
    sy=Math.min(h-1, (y*scy)|0); row=sy*w;
    for(x=0;x<dw;x++){ sx=Math.min(w-1,(x*scx)|0); small[y*dw+x]=gray[row+sx]; }
  }
  return small;
}
function clusterPts(pts, minD){
  var out=[], used=new Uint8Array(pts.length), i,j,g,d;
  for(i=0;i<pts.length;i++){
    if(used[i]) continue;
    g={x:pts[i].x,y:pts[i].y,n:1,r:pts[i].r||0};
    used[i]=1;
    for(j=i+1;j<pts.length;j++){
      if(used[j]) continue;
      d=dist(pts[i],pts[j]);
      if(d<minD){ g.x+=pts[j].x; g.y+=pts[j].y; g.n++; if((pts[j].r||0)>g.r)g.r=pts[j].r; used[j]=1; }
    }
    g.x/=g.n; g.y/=g.n;
    out.push(g);
  }
  return out;
}
function orderA4(pts){
  if(!pts||pts.length!==4) return null;
  var cx=(pts[0].x+pts[1].x+pts[2].x+pts[3].x)/4;
  var cy=(pts[0].y+pts[1].y+pts[2].y+pts[3].y)/4;
  var a=pts.slice().sort(function(p,q){return Math.atan2(p.y-cy,p.x-cx)-Math.atan2(q.y-cy,q.x-cx)});
  var target=SHEET.spanY/SHEET.spanX, best=null, bestErr=1e9, i, k;
  for(i=0;i<4;i++){
    var q=[a[i],a[(i+1)%4],a[(i+2)%4],a[(i+3)%4]];
    var w=(dist(q[0],q[1])+dist(q[3],q[2]))/2;
    var h=(dist(q[0],q[3])+dist(q[1],q[2]))/2;
    if(w<4||h<4) continue;
    var err=Math.abs(h/w-target);
    if(w>h) err=Math.abs(w/h-target)+0.5;
    var para=Math.abs(dist(q[0],q[1])-dist(q[3],q[2]))/w+Math.abs(dist(q[0],q[3])-dist(q[1],q[2]))/h;
    err+=para*0.15;
    if(err<bestErr){bestErr=err; best={TL:q[0],TR:q[1],BR:q[2],BL:q[3],w:w,h:h,err:err}}
  }
  if(!best||best.err>0.048) return null;
  return best;
}
function combos4(arr){
  var out=[], n=arr.length, i,j,k,l;
  for(i=0;i<n-3;i++) for(j=i+1;j<n-2;j++) for(k=j+1;k<n-1;k++) for(l=k+1;l<n;l++) out.push([arr[i],arr[j],arr[k],arr[l]]);
  return out;
}
function markerOriginMm(id){
  var m=SHEET.markerMm, inn=SHEET.insetMm, W=SHEET.wmm, H=SHEET.hmm;
  if(id===0) return {x:inn, y:inn};
  if(id===1) return {x:W-inn-m, y:inn};
  if(id===2) return {x:W-inn-m, y:H-inn-m};
  if(id===3) return {x:inn, y:H-inn-m};
  return null;
}
function markerCornersMm(id){
  var o=markerOriginMm(id), m=SHEET.markerMm;
  if(!o) return null;
  return [{x:o.x,y:o.y},{x:o.x+m,y:o.y},{x:o.x+m,y:o.y+m},{x:o.x,y:o.y+m}];
}
function cornersCenter(corners){
  var i,x=0,y=0;
  for(i=0;i<corners.length;i++){ x+=corners[i].x; y+=corners[i].y; }
  return {x:x/corners.length, y:y/corners.length};
}
function scaleMarkers(markers, scale){
  if(scale===1) return markers;
  return markers.map(function(m){
    return {id:m.id, hammingDistance:m.hammingDistance, corners:m.corners.map(function(p){return {x:p.x*scale, y:p.y*scale};})};
  });
}
function canvasToDetect(c, maxSide){
  var w=c.width, h=c.height, scale=Math.max(1, Math.max(w,h)/maxSide);
  if(scale<=1.02) return {canvas:c, scale:1};
  var dw=Math.max(8, Math.round(w/scale)), dh=Math.max(8, Math.round(h/scale));
  var out=document.createElement('canvas');
  out.width=dw; out.height=dh;
  var ctx=out.getContext('2d');
  ctx.imageSmoothingEnabled=true;
  ctx.drawImage(c,0,0,dw,dh);
  return {canvas:out, scale:w/dw};
}
function runAruco(c){
  if(typeof AR==='undefined' || !AR.Detector) return [];
  var ctx=c.getContext('2d',{willReadFrequently:true});
  var img=ctx.getImageData(0,0,c.width,c.height);
  var det=new AR.Detector({dictionaryName:'ARUCO'});
  return det.detect(img)||[];
}
function layoutErr(picked){
  var c={}, id, ids=[], i;
  for(id=0;id<=3;id++){
    if(picked[id]) c[id]=cornersCenter(picked[id].corners);
  }
  ids=Object.keys(c).map(Number);
  if(ids.length<3) return 1e9;
  var sx=SHEET.spanX, sy=SHEET.spanY, diag=Math.hypot(sx,sy);
  var pairs=[[0,1,sx],[1,2,sy],[2,3,sx],[3,0,sy],[0,2,diag],[1,3,diag]];
  var scales=[], p, d;
  for(i=0;i<pairs.length;i++){
    p=pairs[i];
    if(c[p[0]]&&c[p[1]]){
      d=dist(c[p[0]],c[p[1]]);
      if(d>1) scales.push(d/p[2]);
    }
  }
  if(scales.length<2) return 1e9;
  var mean=0;
  for(i=0;i<scales.length;i++) mean+=scales[i];
  mean/=scales.length;
  var err=0;
  for(i=0;i<scales.length;i++) err+=Math.abs(scales[i]-mean)/mean;
  return err/scales.length;
}
function enumPicked(byId){
  function rec(id, acc, out){
    if(id>3){ out.push(acc); return; }
    var list=byId[id]||[];
    if(!list.length){ rec(id+1, acc, out); return; }
    var i, next;
    for(i=0;i<list.length;i++){
      next={}; for(var k in acc) next[k]=acc[k];
      next[id]=list[i];
      rec(id+1, next, out);
    }
  }
  var out=[]; rec(0, {}, out); return out;
}
function inkScore(picked, gray,w,h){
  var pts=[], id, i, p, n=0, dark=0, gx, gy;
  for(id=0;id<=3;id++) if(picked[id]) pts=pts.concat(picked[id].corners);
  if(pts.length<4) return 0;
  var minX=1e9,minY=1e9,maxX=0,maxY=0;
  for(i=0;i<pts.length;i++){
    p=pts[i]; if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y;
  }
  var x0=minX+(maxX-minX)*0.28, x1=minX+(maxX-minX)*0.72;
  var y0=minY+(maxY-minY)*0.32, y1=minY+(maxY-minY)*0.72;
  var xs=Math.max(0,x0|0), xe=Math.min(w-1,x1|0), ys=Math.max(0,y0|0), ye=Math.min(h-1,y1|0);
  for(gy=ys; gy<=ye; gy+=3){
    for(gx=xs; gx<=xe; gx+=3){
      n++; if(gray[gy*w+gx]<140) dark++;
    }
  }
  return n? dark/n : 0;
}
function sheetFromPicked(picked, err){
  var centers={}, id, markers=[];
  for(id=0;id<=3;id++){
    if(!picked[id]) continue;
    markers.push(picked[id]);
    centers[id]=cornersCenter(picked[id].corners);
  }
  function pt(id, fallbackIds){
    if(centers[id]) return {x:centers[id].x, y:centers[id].y};
    return null;
  }
  var TL=pt(0), TR=pt(1), BR=pt(2), BL=pt(3);
  // If one corner is missing, estimate from the other three (parallelogram).
  if(!TL && TR && BR && BL) TL={x:TR.x+(BL.x-BR.x), y:TR.y+(BL.y-BR.y)};
  if(!TR && TL && BR && BL) TR={x:TL.x+(BR.x-BL.x), y:TL.y+(BR.y-BL.y)};
  if(!BR && TL && TR && BL) BR={x:TR.x+(BL.x-TL.x), y:TR.y+(BL.y-TL.y)};
  if(!BL && TL && TR && BR) BL={x:TL.x+(BR.x-TR.x), y:TL.y+(BR.y-TR.y)};
  if(!TL||!TR||!BR||!BL) return null;
  var w=dist(TL,TR), h=dist(TL,BL);
  return {
    TL:TL, TR:TR, BR:BR, BL:BL,
    w:w, h:h, err:err, ok:true,
    markers:markers, nMarkers:markers.length, ids:markers.map(function(m){return m.id;})
  };
}
function detectSheet(c){
  if(!c || !c.getContext) return null;
  var tries=[MAX_DETECT, Math.min(2400, Math.max(c.width,c.height))], t, i, best=null;
  var grayFull=canvasGray(c);
  for(t=0;t<tries.length;t++){
    var work=canvasToDetect(c, tries[t]);
    var found=runAruco(work.canvas);
    var usable=[];
    for(i=0;i<found.length;i++){
      if(found[i].id>=0 && found[i].id<=3 && found[i].corners && found[i].corners.length===4) usable.push(found[i]);
    }
    usable=scaleMarkers(usable, work.scale);
    if(usable.length<3) continue;
    var byId={0:[],1:[],2:[],3:[]};
    for(i=0;i<usable.length;i++) byId[usable[i].id].push(usable[i]);
    var combos=enumPicked(byId), ci, picked, err, score, ink, sheet;
    for(ci=0;ci<combos.length;ci++){
      picked=combos[ci];
      var n=0; for(i=0;i<=3;i++) if(picked[i]) n++;
      if(n<3) continue;
      err=layoutErr(picked);
      if(err>0.08) continue;
      ink=inkScore(picked, grayFull, c.width, c.height);
      score=(n*2) + ink - err*8;
      if(!best || score>best._score){
        sheet=sheetFromPicked(picked, err);
        if(sheet){ sheet._score=score; sheet.ink=ink; best=sheet; }
      }
    }
    if(best && best.nMarkers>=4 && best.err<0.04) break;
  }
  return best;
}

function solveLinear(A,b){
  var n=b.length, M=[], i,j,k,f,piv,max,tmp;
  for(i=0;i<n;i++){ M[i]=A[i].slice(); M[i].push(b[i]); }
  for(i=0;i<n;i++){
    max=i;
    for(k=i+1;k<n;k++) if(Math.abs(M[k][i])>Math.abs(M[max][i])) max=k;
    tmp=M[i]; M[i]=M[max]; M[max]=tmp;
    piv=M[i][i];
    if(Math.abs(piv)<1e-12) return null;
    for(j=i;j<=n;j++) M[i][j]/=piv;
    for(k=0;k<n;k++) if(k!==i){
      f=M[k][i];
      for(j=i;j<=n;j++) M[k][j]-=f*M[i][j];
    }
  }
  return M.map(function(row){return row[n]});
}
function homography(src, dst){
  var A=[], b=[], i,X,Y,x,y;
  for(i=0;i<4;i++){
    X=dst[i].x; Y=dst[i].y; x=src[i].x; y=src[i].y;
    A.push([X,Y,1,0,0,0,-x*X,-x*Y]); b.push(x);
    A.push([0,0,0,X,Y,1,-y*X,-y*Y]); b.push(y);
  }
  var h=solveLinear(A,b);
  if(!h) return null;
  h.push(1);
  return h;
}
function homographyN(src, dst){
  if(!src||!dst||src.length!==dst.length||src.length<4) return null;
  if(src.length===4) return homography(src, dst);
  var ATA=[], ATb=[], i,j,X,Y,x,y,row1,row2;
  for(i=0;i<8;i++){ ATA[i]=[0,0,0,0,0,0,0,0]; ATb[i]=0; }
  function acc(row, bv){
    var a,b;
    for(a=0;a<8;a++){
      ATb[a]+=row[a]*bv;
      for(b=0;b<8;b++) ATA[a][b]+=row[a]*row[b];
    }
  }
  for(i=0;i<src.length;i++){
    X=dst[i].x; Y=dst[i].y; x=src[i].x; y=src[i].y;
    acc([X,Y,1,0,0,0,-x*X,-x*Y], x);
    acc([0,0,0,X,Y,1,-y*X,-y*Y], y);
  }
  var h=solveLinear(ATA, ATb);
  if(!h) return null;
  h.push(1);
  return h;
}
function applyH(h,X,Y){
  var d=h[6]*X+h[7]*Y+h[8];
  if(Math.abs(d)<1e-12) return {x:-1,y:-1};
  return {x:(h[0]*X+h[1]*Y+h[2])/d, y:(h[3]*X+h[4]*Y+h[5])/d};
}
function warpPerspective(srcCanvas, H, dw, dh){
  var sw=srcCanvas.width, sh=srcCanvas.height;
  var sd=srcCanvas.getContext('2d').getImageData(0,0,sw,sh).data;
  var dest=document.createElement('canvas');
  dest.width=dw; dest.height=dh;
  var dctx=dest.getContext('2d',{willReadFrequently:true});
  var out=dctx.createImageData(dw,dh), od=out.data;
  var x,y,i,p,sx,sy,x0,y0,x1,y1,fx,fy,c,v00,v10,v01,v11;
  for(y=0;y<dh;y++){
    for(x=0;x<dw;x++){
      p=applyH(H,x+0.5,y+0.5);
      sx=p.x; sy=p.y; i=(y*dw+x)*4;
      if(sx<0||sy<0||sx>=sw-1||sy>=sh-1){ od[i]=od[i+1]=od[i+2]=255; od[i+3]=255; continue; }
      x0=sx|0; y0=sy|0; fx=sx-x0; fy=sy-y0; x1=x0+1; y1=y0+1;
      for(c=0;c<3;c++){
        v00=sd[(y0*sw+x0)*4+c]; v10=sd[(y0*sw+x1)*4+c];
        v01=sd[(y1*sw+x0)*4+c]; v11=sd[(y1*sw+x1)*4+c];
        od[i+c]=(v00*(1-fx)*(1-fy)+v10*fx*(1-fy)+v01*(1-fx)*fy+v11*fx*fy+0.5)|0;
      }
      od[i+3]=255;
    }
  }
  dctx.putImageData(out,0,0);
  return dest;
}
function sheetDest(sheet){
  var sides=[], i, m, pxPerMm, markers=sheet.markers||[];
  for(i=0;i<markers.length;i++){
    m=markers[i].corners;
    if(!m||m.length!==4) continue;
    sides.push(dist(m[0],m[1])); sides.push(dist(m[1],m[2]));
    sides.push(dist(m[2],m[3])); sides.push(dist(m[3],m[0]));
  }
  if(sides.length){
    sides.sort(function(a,b){return a-b;});
    pxPerMm=sides[(sides.length/2)|0]/SHEET.markerMm;
  } else {
    pxPerMm=dist(sheet.TL,sheet.TR)/SHEET.spanX;
  }
  var dw=Math.round(SHEET.wmm*pxPerMm);
  dw=Math.max(840, Math.min(MAX_WARP_W, dw));
  var dh=Math.round(dw*SHEET.hmm/SHEET.wmm);
  var C=SHEET.insetMm+SHEET.markerMm/2;
  var dst=[
    {x:C/SHEET.wmm*dw, y:C/SHEET.hmm*dh},
    {x:(SHEET.wmm-C)/SHEET.wmm*dw, y:C/SHEET.hmm*dh},
    {x:(SHEET.wmm-C)/SHEET.wmm*dw, y:(SHEET.hmm-C)/SHEET.hmm*dh},
    {x:C/SHEET.wmm*dw, y:(SHEET.hmm-C)/SHEET.hmm*dh}
  ];
  return {dw:dw, dh:dh, dst:dst, umPerPx:(SHEET.wmm*1000)/dw};
}
function sheetCorrespondences(sheet, dw, dh){
  var src=[], dst=[], i,j, m, mm, markers=sheet.markers||[];
  for(i=0;i<markers.length;i++){
    m=markers[i];
    mm=markerCornersMm(m.id);
    if(!mm||!m.corners||m.corners.length!==4) continue;
    for(j=0;j<4;j++){
      src.push(m.corners[j]);
      dst.push({x:mm[j].x/SHEET.wmm*dw, y:mm[j].y/SHEET.hmm*dh});
    }
  }
  if(src.length>=4) return {src:src, dst:dst};
  return {src:[sheet.TL,sheet.TR,sheet.BR,sheet.BL], dst:sheetDest(sheet).dst};
}
function rectify(srcCanvas, sheet){
  var d=sheetDest(sheet);
  var corr=sheetCorrespondences(sheet, d.dw, d.dh);
  var H=homographyN(corr.src, corr.dst);
  if(!H) return null;
  var canvas=warpPerspective(srcCanvas, H, d.dw, d.dh);
  var mask=new Uint8Array(d.dw*d.dh), x,y,i;
  var rx=SHEET.roi.x/SHEET.wmm*d.dw, ry=SHEET.roi.y/SHEET.hmm*d.dh;
  var rw=SHEET.roi.w/SHEET.wmm*d.dw, rh=SHEET.roi.h/SHEET.hmm*d.dh;
  for(y=0,i=0;y<d.dh;y++) for(x=0;x<d.dw;x++,i++){
    mask[i]=(x>=rx&&x<rx+rw&&y>=ry&&y<ry+rh)?1:0;
  }
  return {canvas:canvas, umPerPx:d.umPerPx, H:H, mask:mask, dw:d.dw, dh:d.dh};
}

function analyze(gray,w,h,opt){
  opt=opt||{};
  var coin=opt.coin, keep=opt.mask, umPerPx=opt.umPerPx;
  var eligible=new Uint8Array(w*h);
  var i,x,y,r2,margin;
  if(coin){
    margin=Math.max(6, coin.r*0.08);
    r2=(coin.r+margin)*(coin.r+margin);
    if(!umPerPx) umPerPx=(COIN_MM*1000)/(coin.r*2);
  }
  var umPerPxRaw=umPerPx;
  umPerPx=umPerPx*SIZE_CAL;
  var nEli=0;
  for(i=0,y=0;y<h;y++){
    for(x=0;x<w;x++,i++){
      if(keep&&!keep[i]) continue;
      if(coin){
        var dx=x-coin.cx, dy=y-coin.cy;
        if(dx*dx+dy*dy<=r2) continue;
      }
      eligible[i]=1; nEli++;
    }
  }
  var th=otsuOn(gray, nEli?eligible:null);
  var mask=new Uint8Array(w*h);
  for(i=0;i<gray.length;i++) mask[i]=(eligible[i]&&gray[i]<th)?1:0;
  var minArea=Math.PI*Math.pow((MIN_UM/umPerPx)/2,2);
  if(minArea<4) minArea=4;
  var maxArea=coin?Math.PI*Math.pow(coin.r*0.55,2):(w*h*0.04);
  var comps=labelsOf(mask,w,h), parts=[], c, dPx, um;
  for(i=0;i<comps.length;i++){
    c=comps[i];
    if(c.area<minArea||c.area>maxArea) continue;
    var pasp=Math.min(c.bw,c.bh)/Math.max(c.bw,c.bh);
    if(pasp<0.28) continue;
    dPx=2*Math.sqrt(c.area/Math.PI);
    um=dPx*umPerPx;
    parts.push({um:um, area:c.area, cx:c.cx, cy:c.cy, r:dPx/2, minX:c.minX, minY:c.minY, maxX:c.maxX, maxY:c.maxY, included:true});
  }
  parts.sort(function(a,b){return a.um-b.um});
  var n=parts.length, totalArea=0, finesArea=0, coarse=[], allStats, used, usedStats, reportMode, note;
  var cutInfo=n?finesCutoffOf(parts):{um:FINES_FLOOR_UM, method:'ratio', d50:0, ratioCut:FINES_FLOOR_UM};
  var cutoff=cutInfo.um, d50=cutInfo.d50;
  for(i=0;i<n;i++){
    totalArea+=parts[i].area;
    if(parts[i].um<=cutoff) finesArea+=parts[i].area;
    else coarse.push(parts[i]);
  }
  var finesAreaFrac=totalArea?finesArea/totalArea:0;
  var finesAreaPct=finesAreaFrac*100;
  allStats=statsOf(parts);
  var cutLbl=roundum(cutoff);
  if(!n){
    reportMode='empty'; used=parts; note='';
  }else if(finesAreaFrac>FINES_AREA_FALLBACK){
    reportMode='fine'; used=parts;
    note='대부분 '+cutLbl+'µm 이하의 고운 분쇄';
  }else if(coarse.length<MIN_COARSE_COUNT){
    reportMode='few'; used=coarse.length?coarse:parts;
    note=cutLbl+'µm보다 큰 입자가 적어 정확한 굵기 측정이 어려워요. 칸 안에 원두를 좀 더 흩뿌려 주세요.';
  }else{
    reportMode='coarse'; used=coarse; note='';
  }
  for(i=0;i<n;i++) parts[i].included=false;
  for(i=0;i<used.length;i++) used[i].included=true;
  usedStats=statsOf(used);
  var countMedianAll=allStats.median;
  var areaMedianAll=n?areaD50(parts):0;
  var countMedianCoarse=coarse.length?statsOf(coarse).median:0;
  var areaMedianCoarse=coarse.length?areaD50(coarse):0;
  var uni=(coarse.length>=MIN_COARSE_COUNT)?uniformityOf(areaMedianAll, countMedianCoarse):{ratio:0,label:'',areaMedian:0,countMedian:0};
  var countMedian=countMedianCoarse;
  var areaMedian=areaMedianAll;
  var median=areaMedianAll;
  var mean=areaMedianAll;
  var bins=[], edges=histEdges();
  for(i=0;i<edges.length-1;i++) bins.push({lo:edges[i], hi:edges[i+1], n:0, area:0, areaPct:0, fines:edges[i+1]<=cutoff+0.5});
  for(i=0;i<n;i++){
    um=parts[i].um;
    var b=0;
    if(um>=bins[bins.length-1].hi) b=bins.length-1;
    else {
      for(var j=0;j<bins.length;j++) if(um>=bins[j].lo&&um<bins[j].hi){b=j;break}
    }
    bins[b].n++; bins[b].area+=parts[i].area;
  }
  for(i=0;i<bins.length;i++){
    bins[i].areaPct=totalArea?100*bins[i].area/totalArea:0;
    bins[i].countPct=n?100*bins[i].n/n:0;
  }
  var cats=RANGES.filter(function(r){return mean>=r.lo&&mean<=r.hi});
  return {
    parts:parts, mean:mean, median:median, countMedian:countMedian, areaMedian:areaMedian,
    countMedianAll:countMedianAll, areaMedianAll:areaMedianAll,
    countMedianCoarse:countMedianCoarse, areaMedianCoarse:areaMedianCoarse,
    uniRatio:uni.ratio, uniLabel:uni.label,
    count:usedStats.count,
    countAll:n, countCoarse:coarse.length, countFines:n-coarse.length,
    finesAreaPct:finesAreaPct, finesAreaFrac:finesAreaFrac, reportMode:reportMode, note:note,
    finesCutoffUm:cutoff, areaD50:d50, finesMethod:cutInfo.method, ratioCut:cutInfo.ratioCut,
    rawMean:allStats.mean, rawMedian:allStats.median,
    umPerPx:umPerPx, umPerPxRaw:umPerPxRaw, sizeCal:SIZE_CAL, threshold:th, coin:coin||null, bins:bins, categories:cats, w:w, h:h
  };
}
function drawScaled(img, maxSide){
  maxSide=maxSide||MAX_SRC;
  var w=img.width||img.naturalWidth||img.videoWidth, h=img.height||img.naturalHeight||img.videoHeight;
  var s=Math.min(1, maxSide/Math.max(w,h));
  var cw=Math.max(1,Math.round(w*s)), ch=Math.max(1,Math.round(h*s));
  var c=document.createElement('canvas');
  c.width=cw; c.height=ch;
  var ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,0,0,cw,ch);
  return c;
}
function canvasGray(c){return toGray(c.getContext('2d').getImageData(0,0,c.width,c.height))}
function defaultCoin(c){var m=Math.min(c.width,c.height); return {cx:c.width*0.3, cy:c.height*0.5, r:m*0.16, auto:false}}
function measureCanvas(c, coin){
  var gray=canvasGray(c);
  var sheet=detectSheet(c);
  if(sheet&&sheet.ok && !coin){
    var rec=rectify(c, sheet);
    if(rec){
      var g2=canvasGray(rec.canvas);
      var res=analyze(g2, rec.canvas.width, rec.canvas.height, {umPerPx:rec.umPerPx, mask:rec.mask});
      res.sheet=sheet; res.source='sheet'; res.rectified=rec.canvas;
      res.overlay=overlayURL(rec.canvas,res);
      return res;
    }
  }
  var det=coin||detectCoin(gray,c.width,c.height)||defaultCoin(c);
  var res=analyze(gray,c.width,c.height,{coin:det});
  res.source='coin';
  res.overlay=overlayURL(c,res);
  return res;
}
function overlayURL(c,res){
  var o=document.createElement('canvas');
  o.width=c.width; o.height=c.height;
  var ctx=o.getContext('2d');
  ctx.drawImage(c,0,0);
  var parts=res.parts, i, p;
  ctx.lineWidth=Math.max(1, Math.round(Math.min(c.width,c.height)/400));
  for(i=0;i<parts.length;i++){
    p=parts[i];
    ctx.beginPath();
    if(p.included!==false){
      ctx.strokeStyle='rgba(83,97,73,.95)';
      ctx.fillStyle='rgba(169,184,160,.38)';
    }else{
      ctx.strokeStyle='rgba(150,120,100,.55)';
      ctx.fillStyle='rgba(200,170,150,.22)';
    }
    ctx.arc(p.cx,p.cy,Math.max(2,p.r),0,Math.PI*2);
    ctx.fill(); ctx.stroke();
  }
  if(res.coin){
    var coin=res.coin;
    ctx.beginPath();
    ctx.strokeStyle='rgba(196,80,70,.95)';
    ctx.lineWidth=Math.max(2, Math.round(Math.min(c.width,c.height)/220));
    ctx.setLineDash([8,6]);
    ctx.arc(coin.cx,coin.cy,coin.r,0,Math.PI*2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if(res.source==='sheet'){
    var rx=SHEET.roi.x/SHEET.wmm*c.width, ry=SHEET.roi.y/SHEET.hmm*c.height;
    var rw=SHEET.roi.w/SHEET.wmm*c.width, rh=SHEET.roi.h/SHEET.hmm*c.height;
    var pad=Math.max(8, Math.round(Math.min(c.width,c.height)*0.01));
    var sx=Math.max(0, rx-pad), sy=Math.max(0, ry-pad);
    var sw=Math.min(c.width-sx, rw+pad*2), sh=Math.min(c.height-sy, rh+pad*2);
    var crop=document.createElement('canvas');
    crop.width=Math.max(1,sw|0); crop.height=Math.max(1,sh|0);
    crop.getContext('2d').drawImage(o,sx,sy,sw,sh,0,0,crop.width,crop.height);
    return crop.toDataURL('image/jpeg',0.85);
  }
  return o.toDataURL('image/jpeg',0.85);
}
function loadFile(file){
  if(window.createImageBitmap){
    return createImageBitmap(file,{imageOrientation:'from-image'}).then(function(bmp){
      var c=drawScaled(bmp); if(bmp.close) try{bmp.close()}catch(e){} return c;
    }).catch(function(){return loadFileFallback(file)});
  }
  return loadFileFallback(file);
}
function loadFileFallback(file){
  return new Promise(function(resolve,reject){
    var url=URL.createObjectURL(file);
    var img=new Image();
    img.onload=function(){URL.revokeObjectURL(url); resolve(drawScaled(img))};
    img.onerror=function(){URL.revokeObjectURL(url); reject(new Error('이미지를 열 수 없어요'))};
    img.src=url;
  });
}
function loadDataURL(url){
  return new Promise(function(resolve,reject){
    var img=new Image();
    img.onload=function(){resolve(drawScaled(img))};
    img.onerror=function(){reject(new Error('이미지를 열 수 없어요'))};
    img.src=url;
  });
}

function grindView(keep){
  if(!keep){S={phase:'guide', canvas:null, coin:null, auto:false, result:null, drag:null, mode:null, sheet:null, rectified:null}}
  if(S.phase==='mark'&&S.canvas) renderMark();
  else if(S.phase==='sheet'&&S.canvas) renderSheetConfirm();
  else if(S.phase==='result'&&S.result) renderResult();
  else renderGuide();
}
function renderGuide(){
  S.phase='guide';
  appEl().innerHTML=gTop('내 분쇄도 측정하기')+'<div class="pad g-page">'+
    '<p class="q">분쇄도를 사진으로 측정해요</p>'+
    '<p class="qsub">측정 용지의 표시를 기준으로 알갱이 크기를 가늠합니다. 용지가 없으면 100원 동전(지름 24mm)으로도 측정할 수 있어요.</p>'+
    '<p class="g-notice">'+FINE_MEASURE_NOTE+'</p>'+
    '<div class="g-steps">'+
      step(1,'측정 용지를 준비하기','A4에 2장 인쇄 후 잘라서 사용하세요. 100% 크기로 인쇄하고, 배율 맞춤(맞춤 용지)은 꼭 꺼 주세요.')+
      '<div class="g-dlwrap"><a class="g-dl" href="assets/grind-sheet.pdf" download="그냥커피-분쇄도-측정용지.pdf">측정 용지 내려받기</a>'+
      '<img class="g-sheet-preview" src="assets/grind-sheet.png" alt="분쇄도 측정 용지 미리보기"></div>'+
      step(2,'원두가루 흩뿌리기','칸 안에 분쇄된 원두를 한 꼬집 정도 흩뿌려주세요(알갱이가 최대한 서로 붙지 않게 하고 네 귀퉁이 표시가 가려지지 않게 해주세요)')+
      step(3,'플래시를 켜고 촬영','카메라 플래시를 켠 뒤, 용지가 틀어지지 않게 바로 위에서 네 귀퉁이 표시가 모두 나오게 찍어 주세요.')+
    '</div>'+
    '<div class="g-picks">'+
      '<input id="g-file-cam" class="g-file" type="file" accept="image/*" capture="environment">'+
      '<input id="g-file-lib" class="g-file" type="file" accept="image/*">'+
      '<button type="button" class="bigbtn primary" id="g-pick-cam">사진 촬영</button>'+
      '<button type="button" class="bigbtn" id="g-pick-lib">갤러리에서 선택</button>'+
    '</div>'+
    '</div>';
  bindFilePicks();
}
function bindFilePicks(){
  function hook(inputId, btnId){
    var inp=$(inputId), btn=$(btnId);
    if(!inp||!btn) return;
    btn.onclick=function(){ inp.value=''; inp.click(); };
    inp.onchange=function(){
      var f=this.files&&this.files[0];
      this.value='';
      if(!f) return;
      enterBusy('사진을 불러오는 중…');
      loadFile(f).then(afterLoad).catch(function(e){alert(e.message||'이미지를 열 수 없어요'); renderGuide()});
    };
  }
  hook('g-file-cam','g-pick-cam');
  hook('g-file-lib','g-pick-lib');
}
function step(n,t,s){return '<div class="card g-step"><span class="num">'+n+'</span><div><b>'+t+'</b><span>'+s+'</span></div></div>'}
function enterBusy(msg){
  appEl().innerHTML=gTop('내 분쇄도 측정하기')+'<div class="pad g-page"><p class="q">'+gEsc(msg)+'</p><p class="qsub">잠시만 기다려 주세요</p></div>';
}
function afterLoad(c){
  S.canvas=c; S.result=null; S.sheet=null; S.rectified=null; S.drag=null;
  var gray=canvasGray(c);
  var sheet=detectSheet(c);
  if(sheet&&sheet.ok){
    S.sheet=sheet; S.mode='sheet'; S.phase='sheet';
    renderSheetConfirm();
    return {mode:'sheet', sheet:sheet, w:c.width, h:c.height};
  }
  S.mode='coin';
  var det=detectCoin(gray,c.width,c.height);
  S.auto=!!det;
  S.coin=det||defaultCoin(c);
  renderMark();
  return {mode:'coin', coin:S.coin, auto:S.auto, w:c.width, h:c.height};
}
function renderSheetConfirm(){
  S.phase='sheet';
  appEl().innerHTML=gTop('내 분쇄도 측정하기')+'<div class="pad g-page g-confirm">'+
    '<p class="q">측정 용지를 찾았어요</p>'+
    '<p class="qsub">네 귀퉁이 표시가 맞는지 확인해 주세요.</p>'+
    '<div class="g-stage card"><canvas id="g-cv"></canvas></div>'+
    '<div class="g-actions">'+
      '<button type="button" class="bigbtn primary g-go" id="g-go">이대로 측정하기</button>'+
      '<div class="g-alt">'+
        '<button type="button" class="btn2" id="g-coin">동전으로 맞추기</button>'+
        '<button type="button" class="btn2" id="g-again">다른 사진 고르기</button>'+
      '</div>'+
    '</div></div>';
  var cv=$('g-cv');
  fitCanvas(cv,S.canvas);
  drawSheetMarks(cv);
  $('g-go').onclick=function(){runAnalyze()};
  $('g-coin').onclick=function(){
    S.mode='coin'; S.sheet=null;
    var det=detectCoin(canvasGray(S.canvas),S.canvas.width,S.canvas.height);
    S.auto=!!det; S.coin=det||defaultCoin(S.canvas);
    renderMark();
  };
  $('g-again').onclick=function(){resetTool(); renderGuide()};
}
function drawSheetMarks(cv){
  var ctx=cv.getContext('2d'), c=S.canvas, sh=S.sheet;
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.drawImage(c,0,0);
  if(!sh) return;
  var pts=[sh.TL,sh.TR,sh.BR,sh.BL], i;
  ctx.strokeStyle='rgba(196,80,70,.95)';
  ctx.fillStyle='rgba(196,80,70,.16)';
  ctx.lineWidth=Math.max(2, cv.width/220);
  ctx.setLineDash([10,7]);
  ctx.beginPath();
  ctx.moveTo(sh.TL.x,sh.TL.y);
  ctx.lineTo(sh.TR.x,sh.TR.y);
  ctx.lineTo(sh.BR.x,sh.BR.y);
  ctx.lineTo(sh.BL.x,sh.BL.y);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.setLineDash([]);
  for(i=0;i<pts.length;i++){
    ctx.beginPath();
    ctx.fillStyle='#C45046';
    ctx.strokeStyle='#fff';
    ctx.lineWidth=2;
    ctx.arc(pts[i].x,pts[i].y,Math.max(7,cv.width/90),0,Math.PI*2);
    ctx.fill(); ctx.stroke();
  }
}
function resetTool(){S={phase:'guide',canvas:null,coin:null,auto:false,result:null,drag:null,mode:null,sheet:null,rectified:null}}
function enterMark(c){
  S.canvas=c; S.result=null; S.phase='mark'; S.mode='coin';
  var gray=canvasGray(c);
  var det=detectCoin(gray,c.width,c.height);
  S.auto=!!det;
  S.coin=det||defaultCoin(c);
  renderMark();
}
function renderMark(){
  S.phase='mark'; S.mode='coin';
  var msg=S.auto
    ? '동전을 찾았어요. 위치가 다르면 원을 옮기거나 크기를 조절해 주세요.'
    : '동전 위에 원을 맞춰 주세요. 원을 끌어 옮기고, 가장자리 점을 끌어 크기를 조절할 수 있어요.';
  appEl().innerHTML=gTop('내 분쇄도 측정하기')+'<div class="pad g-page g-mark">'+
    '<p class="q">동전 위치를 확인해 주세요</p>'+
    '<p class="qsub">'+msg+'</p>'+
    '<div class="g-stage card"><canvas id="g-cv"></canvas></div>'+
    '<div class="g-actions">'+
      '<button type="button" class="bigbtn primary g-go" id="g-go">이대로 측정하기</button>'+
      '<button type="button" class="btn2" id="g-again">다른 사진 고르기</button>'+
    '</div></div>';
  var cv=$('g-cv');
  fitCanvas(cv,S.canvas);
  drawMark(cv);
  bindMark(cv);
  $('g-go').onclick=function(){runAnalyze()};
  $('g-again').onclick=function(){resetTool(); renderGuide()};
}
function fitCanvas(cv, src){
  var maxW=cv.parentElement?cv.parentElement.clientWidth-4:360;
  if(!maxW||maxW<100) maxW=350;
  var maxH=Math.round(Math.min((window.innerHeight||844)*0.52, (window.innerHeight||844)-290));
  if(!maxH||maxH<140) maxH=200;
  var s=Math.min(maxW/src.width, maxH/src.height);
  cv.width=src.width; cv.height=src.height;
  cv.style.width=Math.round(src.width*s)+'px';
  cv.style.height=Math.round(src.height*s)+'px';
}
function evToImg(ev,cv){
  var r=cv.getBoundingClientRect();
  return {x:(ev.clientX-r.left)*(cv.width/r.width), y:(ev.clientY-r.top)*(cv.height/r.height)};
}
function handlePos(coin){return {x:coin.cx+coin.r, y:coin.cy}}
function drawMark(cv){
  var ctx=cv.getContext('2d'), c=S.canvas, coin=S.coin;
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.drawImage(c,0,0);
  ctx.beginPath();
  ctx.strokeStyle='rgba(196,80,70,.95)';
  ctx.lineWidth=Math.max(2, cv.width/220);
  ctx.setLineDash([10,7]);
  ctx.arc(coin.cx,coin.cy,coin.r,0,Math.PI*2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.fillStyle='rgba(196,80,70,.18)';
  ctx.arc(coin.cx,coin.cy,coin.r,0,Math.PI*2);
  ctx.fill();
  var h=handlePos(coin), hr=Math.max(10, cv.width/70);
  ctx.beginPath();
  ctx.fillStyle='#C45046';
  ctx.strokeStyle='#fff';
  ctx.lineWidth=2;
  ctx.arc(h.x,h.y,hr,0,Math.PI*2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle='rgba(196,80,70,.9)';
  ctx.arc(coin.cx,coin.cy,Math.max(4,cv.width/180),0,Math.PI*2);
  ctx.fill();
}
function bindMark(cv){
  function hit(p){
    var coin=S.coin, h=handlePos(coin);
    var hs=Math.max(18, coin.r*0.18);
    if(Math.hypot(p.x-h.x,p.y-h.y)<=hs) return 'resize';
    if(Math.hypot(p.x-coin.cx,p.y-coin.cy)<=coin.r+8) return 'move';
    return 'place';
  }
  function down(ev){
    ev.preventDefault();
    cv.setPointerCapture&&cv.setPointerCapture(ev.pointerId);
    var p=evToImg(ev,cv), mode=hit(p);
    if(mode==='place'){S.coin.cx=p.x; S.coin.cy=p.y; S.auto=false; mode='move'}
    S.drag={mode:mode, dx:p.x-S.coin.cx, dy:p.y-S.coin.cy};
    drawMark(cv);
  }
  function move(ev){
    if(!S.drag) return;
    ev.preventDefault();
    var p=evToImg(ev,cv), coin=S.coin, d=S.drag;
    if(d.mode==='move'){
      coin.cx=Math.max(0,Math.min(cv.width,p.x-d.dx));
      coin.cy=Math.max(0,Math.min(cv.height,p.y-d.dy));
    }else{
      var r=Math.hypot(p.x-coin.cx,p.y-coin.cy);
      coin.r=Math.max(12, Math.min(Math.min(cv.width,cv.height)*0.6, r));
    }
    S.auto=false;
    drawMark(cv);
  }
  function up(){ if(S.drag){S.drag=null; drawMark(cv)} }
  cv.addEventListener('pointerdown',down);
  cv.addEventListener('pointermove',move);
  cv.addEventListener('pointerup',up);
  cv.addEventListener('pointercancel',up);
}
function showGrindError(err){
  var raw=(err&&err.message)?err.message:String(err||'알 수 없는 오류');
  S.phase='error';
  appEl().innerHTML=gTop('내 분쇄도 측정하기')+'<div class="pad g-page">'+
    '<p class="q">측정 중 문제가 생겼어요</p>'+
    '<div class="g-errbox"><b>오류가 발생했습니다</b><p>'+gEsc(raw)+'</p></div>'+
    '<p class="qsub">사진을 다시 찍거나, 동전으로 측정해 주세요.</p>'+
    '<button type="button" class="bigbtn primary g-go" id="g-retry">다시 측정하기</button>'+
    '<button type="button" class="btn2" id="g-coin">동전으로 맞추기</button>'+
    '</div>';
  var btn=$('g-retry'); if(btn) btn.onclick=function(){resetTool(); renderGuide()};
  var c=$('g-coin'); if(c) c.onclick=function(){
    if(!S.canvas){resetTool(); renderGuide(); return;}
    S.mode='coin'; S.sheet=null;
    var det=detectCoin(canvasGray(S.canvas),S.canvas.width,S.canvas.height);
    S.auto=!!det; S.coin=det||defaultCoin(S.canvas);
    renderMark();
  };
}
function runAnalyze(){
  if(!S.canvas) return null;
  enterBusy('알갱이를 측정하는 중…');
  return new Promise(function(resolve){
    setTimeout(function(){
      try{
        if(S.mode==='sheet'&&S.sheet){
          var rec=rectify(S.canvas, S.sheet);
          if(rec){
            var g=canvasGray(rec.canvas);
            S.rectified=rec.canvas;
            S.result=analyze(g, rec.canvas.width, rec.canvas.height, {umPerPx:rec.umPerPx, mask:rec.mask});
            S.result.sheet=S.sheet; S.result.source='sheet'; S.result.rectified=rec.canvas;
            try{ S.result.overlay=overlayURL(rec.canvas, S.result); }catch(e1){ S.result.overlay=null; }
          }else{
            S.mode='coin';
            S.result=measureCanvas(S.canvas, S.coin||detectCoin(canvasGray(S.canvas),S.canvas.width,S.canvas.height)||defaultCoin(S.canvas));
          }
        }else{
          S.result=measureCanvas(S.canvas, S.coin);
        }
        if(!S.result) throw new Error('결과를 만들지 못했어요');
        S.phase='result';
        renderResult();
        resolve(S.result);
      }catch(err){
        showGrindError(err);
        resolve(null);
      }
    },40);
  });
}
function catLine(res){
  if(!res.count) return '입자를 찾지 못했어요';
  if(res.categories.length) return res.categories.map(function(c){return c.name}).join(' · ');
  if(res.mean<200) return '에스프레소보다 고운 편';
  if(res.mean>1600) return '프렌치프레스보다 굵은 편';
  return '참고 범위 사이';
}
function renderResult(){
  var res=S.result;
  var sub, html;
  if(!res.count){
    html=gTop('내 분쇄도 측정하기')+'<div class="pad g-page g-result">'+
      '<p class="q">알갱이를 찾지 못했어요</p>'+
      '<p class="qsub">알갱이를 찾지 못했어요 — 칸 안에 원두를 더 흩뿌려 주세요</p>';
  }else{
    sub='입자 '+(res.countAll||res.count)+'개';
    if(res.source==='sheet') sub+=' · 측정 용지 기준';
    else if(res.source==='coin') sub+=' · 100원 동전 기준';
    var fp=res.finesAreaPct||0, fpTxt=fp<10?fp.toFixed(1):String(Math.round(fp));
    var uniTxt=res.uniLabel?(res.uniLabel+' ('+(Math.round(res.uniRatio*100)/100).toFixed(2)+')'):'—';
    html=gTop('내 분쇄도 측정하기')+'<div class="pad g-page g-result">'+
      '<div class="g-meds">'+
        '<div class="g-med"><span class="g-mk">대표 입자크기</span><span class="g-mv">약 '+roundum(res.areaMedianAll||res.areaMedian)+'µm</span></div>'+
        '<div class="g-med"><span class="g-mk">균일도</span><span class="g-mv">'+uniTxt+'</span></div>'+
        '<div class="g-med"><span class="g-mk">미분 비율</span><span class="g-mv">'+fpTxt+'%</span></div>'+
      '</div>'+
      (res.uniLabel?'<p class="g-uni-note">1에 가까울수록 더 균일합니다</p>':'')+
      '<p class="qsub">'+sub+'</p>';
  }
  if(res.reportMode==='fine'){
    html+='<p class="g-note">'+gEsc(res.note||('대부분 '+roundum(res.finesCutoffUm||FINES_FLOOR_UM)+'µm 이하의 고운 분쇄'))+'</p>';
    html+='<p class="g-notice">'+FINE_MEASURE_NOTE+'</p>';
  }else if(res.reportMode==='few'&&res.note){
    html+='<p class="g-note">'+gEsc(res.note)+'</p>';
  }
  if(res.count&&res.reportMode!=='fine'&&(res.areaMedianAll||res.areaMedian)<400){
    html+='<p class="g-notice">'+FINE_MEASURE_NOTE+'</p>';
  }
  if(res.count){
    html+='<div class="card g-cat"><b>'+gEsc(catLine(res))+'</b><span>아래는 널리 쓰이는 일반 참고 범위입니다</span></div>';
    html+=scaleBar(res.areaMedianAll||res.areaMedian);
  }
  if(res.overlay){
    var cap=res.source==='sheet'?'초록 원은 주 입자입니다':'초록 원은 주 입자, 빨간 점선은 동전입니다';
    if(res.countFines) cap+='. 연한 표시는 미분('+roundum(res.finesCutoffUm||FINES_FLOOR_UM)+'µm 이하)입니다';
    html+='<div class="g-particles">'+
      '<button type="button" class="btn2 g-particles-toggle" id="g-particles-toggle" aria-expanded="false" aria-controls="g-particles-panel">측정된 입자 보기</button>'+
      '<div class="g-particles-panel" id="g-particles-panel" hidden>'+
        '<div class="g-stage card"><img id="g-particles-img" alt="측정된 입자" src="'+res.overlay+'"></div>'+
        '<p class="muted g-cap">'+cap+'</p>'+
      '</div>'+
    '</div>';
  }
  if(res.countAll) html+=histogram(res);
  html+='<p class="g-caveat">이 결과는 추정치입니다. 대표 입자크기는 미분을 포함한 입자 양 기준 중앙값입니다. 균일도는 대표 입자크기(미분 포함)를 미분 제외 개수 기준 중앙값으로 나눈 값입니다. 아래 분포는 개수와 입자 양 기준으로 함께 보여 줍니다. 뭉친 알갱이는 더 크게 보이거나 균일도가 낮아 보일 수 있습니다. 측정 용지는 100% 크기로 인쇄하고, 촬영 시 플래시를 켜 주세요.</p>'+
    '<button type="button" class="bigbtn primary" id="g-retry">다시 측정하기</button>'+
    '</div>';
  appEl().innerHTML=html;
  var btn=$('g-retry'); if(btn) btn.onclick=function(){resetTool(); renderGuide()};
  bindParticlesToggle();
}
function bindParticlesToggle(){
  var btn=$('g-particles-toggle'), panel=$('g-particles-panel');
  if(!btn||!panel) return;
  btn.onclick=function(){
    var open=btn.getAttribute('aria-expanded')==='true';
    var next=!open;
    btn.setAttribute('aria-expanded', next?'true':'false');
    btn.textContent=next?'측정된 입자 숨기기':'측정된 입자 보기';
    if(next) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden','');
  };
}
function scaleBar(mean){
  var pin=Math.max(0,Math.min(100, mean/AXIS_MAX*100));
  var h='<div class="card g-scale"><div class="g-scale-k">일반 참고 범위</div><p class="g-scale-sub">입자 양 기준 중앙값으로 표시</p><div class="g-axis">';
  RANGES.forEach(function(r,i){
    var left=r.lo/AXIS_MAX*100, w=(r.hi-r.lo)/AXIS_MAX*100;
    h+='<i class="g-band g-band-'+i+'" style="left:'+left+'%;width:'+w+'%"></i>';
  });
  h+='<span class="g-pin" style="left:'+pin+'%" title="약 '+roundum(mean)+'µm"></span>';
  h+='</div><div class="g-axis-lbl"><span>0</span><span>800</span><span>1600µm</span></div><ul class="g-leg">';
  RANGES.forEach(function(r){
    var on=mean>=r.lo&&mean<=r.hi?' on':'';
    h+='<li class="'+on+'"><i></i><b>'+r.name+'</b> ~'+r.lo+'–'+r.hi+'µm</li>';
  });
  return h+'</ul></div>';
}
function histogram(res){
  var i, maxA=1, maxN=1, bins=res.bins||[], n=bins.length;
  for(i=0;i<n;i++){
    if(bins[i].areaPct>maxA) maxA=bins[i].areaPct;
    if(bins[i].n>maxN) maxN=bins[i].n;
  }
  var axisLo=n?bins[0].lo:HIST_LOG_MIN, axisHi=n?bins[n-1].hi:HIST_LOG_MAX;
  var overflow=n && res.parts && res.parts.length && res.parts[res.parts.length-1].um>=axisHi-0.5;
  var fp=res.finesAreaPct||0;
  var fpTxt=fp<10?fp.toFixed(1):String(Math.round(fp));
  var cutTxt=roundum(res.finesCutoffUm||FINES_FLOOR_UM);
  function chart(kind){
    var h='<div class="g-hscroll"><div class="g-hchart" style="--n:'+n+'">', b, frac, pct, cls, ttl, hiLab;
    h+='<div class="g-hcols">';
    for(i=0;i<n;i++){
      b=bins[i];
      frac=kind==='count'?(b.n/maxN):(b.areaPct/maxA);
      pct=Math.max(0, Math.round(frac*100));
      cls=b.fines?' g-fine':'';
      hiLab=(overflow && i===n-1)?(Math.round(b.lo)+'+'):(Math.round(b.lo)+'–'+Math.round(b.hi));
      ttl=kind==='count'?(hiLab+'µm · '+b.n+'개'):(hiLab+'µm · '+Math.round(b.areaPct)+'%');
      h+='<span class="g-hcol'+cls+'" title="'+ttl+'"><i style="height:'+pct+'%"></i></span>';
    }
    h+='</div><div class="g-haxis">';
    var ticks=HIST_LOG_TICKS, v, left, cls;
    for(i=0;i<ticks.length;i++){
      v=ticks[i];
      if(v<axisLo-0.5 || v>axisHi+0.5) continue;
      left=histTickLeft(v, axisLo, axisHi);
      cls=left<=0.5?'g-hstart':(left>=99.5?'g-hend':'');
      h+='<span class="'+cls+'" style="left:'+left+'%">'+v+'</span>';
    }
    return h+'</div></div></div>';
  }
  var h='<div class="card g-hist">';
  h+='<p class="g-fines-pct">미분 기준: '+cutTxt+'µm 이하 (자동) · 입자 양 기준 '+fpTxt+'%</p>';
  var countMedTxt=roundum(res.countMedianAll!=null?res.countMedianAll:res.rawMedian);
  h+='<div class="g-scale-k">입자 양 기준</div>'+chart('area');
  h+='<div class="g-scale-k g-dist-k">입자 개수 기준</div>'+chart('count');
  h+='<p class="g-hcap">입자 개수 기준 중앙값 약 '+countMedTxt+'µm</p>';
  return h+'</div>';
}

window.grindView=grindView;
window.__grind={
  measureImage:function(img,coin){
    var c=img&&img.getContext?img:drawScaled(img);
    return measureCanvas(c, coin||null);
  },
  detectCoin:function(img){
    var c=img&&img.getContext?img:drawScaled(img);
    return detectCoin(canvasGray(c),c.width,c.height);
  },
  detectSheet:function(img){
    var c=img&&img.getContext?img:drawScaled(img);
    return detectSheet(c);
  },
  openDataURL:function(url){
    return loadDataURL(url).then(function(c){return afterLoad(c)});
  },
  confirm:function(){return runAnalyze()},
  state:function(){return {phase:S.phase, mode:S.mode, coin:S.coin, auto:S.auto, sheet:S.sheet, result:S.result&&{mean:S.result.mean,median:S.result.median,countMedian:S.result.countMedian,areaMedian:S.result.areaMedian,countMedianAll:S.result.countMedianAll,areaMedianAll:S.result.areaMedianAll,countMedianCoarse:S.result.countMedianCoarse,areaMedianCoarse:S.result.areaMedianCoarse,uniRatio:S.result.uniRatio,uniLabel:S.result.uniLabel,count:S.result.count,countAll:S.result.countAll,countCoarse:S.result.countCoarse,finesAreaPct:S.result.finesAreaPct,finesCutoffUm:S.result.finesCutoffUm,areaD50:S.result.areaD50,finesMethod:S.result.finesMethod,reportMode:S.result.reportMode,rawMean:S.result.rawMean,rawMedian:S.result.rawMedian,threshold:S.result.threshold,umPerPx:S.result.umPerPx,umPerPxRaw:S.result.umPerPxRaw,sizeCal:S.result.sizeCal,source:S.result.source,categories:S.result.categories.map(function(c){return c.name})}}},
  FINES_RATIO:FINES_RATIO, FINES_FLOOR_UM:FINES_FLOOR_UM, FINES_VALLEY_LO:FINES_VALLEY_LO, FINES_VALLEY_HI:FINES_VALLEY_HI, SIZE_CAL:SIZE_CAL
};
})();
