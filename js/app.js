(function(){
var B=window.BEANS||[],app=document.getElementById('app'),st={a:{}},timer=null;
var STEPS={1:['익숙한 새로움','부드럽고 편안한 커피향, 부담스럽지 않은 산미'],2:['맛의 놀이터','복합적인 향과 새로운 개성'],3:['원초적 강렬함','깊은 다크함과 짙은 고소함'],4:['다름 너머의 특별함','압도적인 퀄리티의 특별한 개성']};
var ACID={high:['좋아해요','밝고 상큼한 산미가 좋아요',[1,7]],mid:['은은한 정도','살짝 느껴지는 정도가 좋아요',[8,14]],low:['싫어해요','산미 없이 고소한 게 좋아요',[15,20]]};
var CH={'과일':'🍑 상큼달콤한 과일 향','꽃':'🌼 화사한 꽃 향','초콜릿':'🍫 고소한 초콜릿·견과 향','any':'상관없어요'};
var ROAST=['#B07A4F','#9B5E2B','#8A5326','#6E4019','#5A3214','#43281A','#2E1D14'];
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function byId(id){for(var i=0;i<B.length;i++)if(B[i].id===id)return B[i]}
function band(r){return r<=7?'high':r<=14?'mid':'low'}
function top(t){return '<div class="top"><button class="back" onclick="history.length>1?history.back():location.hash=\'\'">← 뒤로</button><h1>'+esc(t)+'</h1></div>'}
function tc(b){for(var g in CHO)if(CHO[g].indexOf(b.id)>=0)return g;return b.characters[0]}
function card(b,extra){return '<button class="bean" data-char="'+tc(b)+'" onclick="location.hash=\'#/bean/'+b.id+'\'"><img src="'+b.image+'" alt="" loading="lazy"><div>'+(extra&&extra.rank?'<span class="rank">'+extra.rank+'</span>':'')+'<b>'+esc(b.name)+'</b><span>'+esc(b.keywords.join(' · '))+'</span>'+(extra&&extra.why?'<span class="why">'+esc(extra.why)+'</span>':'')+'</div></button>'}
function popts(b){var p=(b.purchase||[]).slice();if(!p.length&&b.purchaseUrl)p=[{weight:'구매',url:b.purchaseUrl}];return p}
function okurl(u){return /^https?:\/\//.test(u||'')}
function buy(b,cls){return popts(b).length?'<button type="button" class="buy '+(cls||'')+'" data-buy="'+b.id+'">구매하기</button>':'<span class="buy off '+(cls||'')+'" aria-disabled="true">구매 링크 준비 중</span>'}
function closeSheet(){var s=document.getElementById('sheet');if(s)s.remove();document.removeEventListener('keydown',escK)}
function escK(e){if(e.key==='Escape')closeSheet()}
function openSheet(b){closeSheet();var d=document.createElement('div');d.id='sheet';d.className='sheetwrap';d.setAttribute('data-char',tc(b));
 var h='<div class="sheet" role="dialog" aria-modal="true" aria-label="중량 선택"><div class="grab"></div><button class="sx" aria-label="닫기">✕</button><div class="stitle">중량을 선택해 주세요</div><div class="sname">'+esc(b.name)+'</div>';
 popts(b).forEach(function(o){h+=okurl(o.url)?'<a class="wopt" href="'+esc(o.url)+'" target="_blank" rel="noopener"><b>'+esc(o.weight)+'</b><span>구매 페이지 →</span></a>':'<span class="wopt off" aria-disabled="true"><b>'+esc(o.weight)+'</b><span>링크 준비 중</span></span>'});
 d.innerHTML=h+'</div>';document.body.appendChild(d);
 d.onclick=function(e){if(e.target===d||e.target.closest('.sx'))closeSheet()};document.addEventListener('keydown',escK);d.querySelector('.sx').focus()}
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-buy]');if(t){e.preventDefault();e.stopPropagation();openSheet(byId(t.getAttribute('data-buy')))}},true);
function stopTimer(){if(timer){clearInterval(timer.h);timer=null}}
function home(){app.innerHTML='<div class="brand"><div class="logo">GEU NYANG COFFEE</div><h1>그냥커피</h1><p>나에게 맞는 원두와 레시피를 찾아보세요</p></div><div class="pad">'+
'<button class="bigbtn primary" onclick="location.hash=\'#/quiz/1\'">내 취향으로 찾기<small>2가지 질문으로 원두 추천 받기</small></button>'+
'<button class="bigbtn rmbtn" onclick="location.hash=\'#/roadmap\'">추천 테이스팅 로드맵<small>STEP 1부터 순서대로 마셔보는 원두 코스</small></button>'+
'<button class="bigbtn" onclick="location.hash=\'#/list\'">전체 원두 보기<small>20가지 원두 한눈에 보기</small></button>'+
'<div class="hrow"><button class="bigbtn half" onclick="location.hash=\'#/recipes\'">레시피 탐색<small>핸드드립 · 에스프레소</small></button><button class="bigbtn half" onclick="location.hash=\'#/know-how\'">커피 노하우<small>보관 · 분쇄도</small></button></div></div>'}
function prog(n){var s='<div class="progress">';for(var i=1;i<=2;i++)s+='<i class="'+(i<=n?'on':'')+'"></i>';return s+'</div><div class="muted">질문 '+n+' / 2</div>'}
function opt(k,v,b,s,num){return '<button class="opt'+(st.a[k]==v?' sel':'')+'" data-k="'+k+'" data-v="'+v+'">'+(num?'<span class="num">'+num+'</span>':'')+'<div><b>'+esc(b)+'</b>'+(s?'<span>'+esc(s)+'</span>':'')+'</div></button>'}
// 산미 '싫어해요' 분기: 고정 추천 (여기서 수정)
var LOWMAP={strong:{label:'진한 맛',beans:[['mood-indigo','산미가 적고 다크 초코의 쌉싸름함과 카라멜의 단맛, 은은한 스모키 향을 좋아하시는 분께'],['guatemala-dark','산미가 적고 고급 훈연 향과 묵직한 바디감, 다크 초코의 깊은 향을 좋아하시는 분께']]},
 soft:{label:'부드러운 맛',beans:[['brazil-caramelado','약한 신맛에 땅콩 카라멜·초코 쿠키의 달콤 고소함을 부드럽게 즐기고 싶은 분께'],['mocha-mousse','신맛·쓴맛이 적고 매끄러운 바디감과 달콤 고소한 코코아 향을 원하시는 분께'],['guatemala-mediumdark','흑설탕·다크초코의 단맛과 고급스런 훈연 향, 약한 신맛의 호불호 없는 올라운더를 찾는 분께']]}};
function quiz(n){var h=top('취향 찾기')+'<div class="pad">'+prog(n);
 if(n==1){h+='<p class="q">커피의 산미(신맛)는<br>어떠세요?</p><p class="qsub">새콤한 맛에 대한 취향이에요</p>';for(var k in ACID)h+=opt('acid',k,ACID[k][0],ACID[k][1])}
 if(n==2&&st.a.acid=='low'){h+='<p class="q">진한 맛이 좋으세요,<br>부드러운 맛이 좋으세요?</p><p class="qsub">산미가 적은 커피 중에서 골라드릴게요</p>'+opt('body','strong','진한 맛','다크 초콜릿·훈연 향의 묵직한 맛')+opt('body','soft','부드러운 맛','카라멜·코코아의 달콤 고소한 맛')}
 else if(n==2){h+='<p class="q">어떤 향이 좋으세요?</p><p class="qsub">커피의 전체적인 캐릭터예요</p>';for(var c in CH)h+=opt('ch',c,c=='any'?'상관없어요':c,c=='any'?'모두 좋아요':CH[c])}
 app.innerHTML=h+'</div>';
 app.querySelectorAll('.opt').forEach(function(el){el.onclick=function(){var k=el.dataset.k,v=el.dataset.v;st.a[k]=v;if(k=='acid'){delete st.a.ch;delete st.a.body}location.hash=n<2?'#/quiz/'+(n+1):'#/result'}})}
function recommend(a){var c=ACID[a.acid]?(ACID[a.acid][2][0]+ACID[a.acid][2][1])/2:10.5;
 return B.map(function(b){var s=0,why=[];
  if(a.acid&&band(b.acidityRank)==a.acid){s+=2;why.push('산미 '+ACID[a.acid][0].replace('해요','하는 분께').replace('은은한 정도','은은하게'))}
  if(a.ch&&a.ch!='any'&&b.characters.indexOf(a.ch)>=0){s+=2;why.push(a.ch+' 캐릭터')}
  return {b:b,s:s,d:Math.abs(b.acidityRank-c),why:why}}).sort(function(x,y){return y.s-x.s||x.d-y.d}).slice(0,3)}
function result(){if(st.a.acid=='low'&&LOWMAP[st.a.body]){var L=LOWMAP[st.a.body],hh=top('추천 결과')+'<div class="pad"><p class="q">당신을 위한 원두 '+L.beans.length+'가지</p><p class="qsub">산미 싫어해요 · '+L.label+'</p>';
  L.beans.forEach(function(x,i){var b=byId(x[0]);hh+='<div class="rcard" data-char="'+tc(b)+'">'+card(b,{rank:(i+1)+'순위',why:'추천 이유: '+x[1]})+buy(b,'sm')+'</div>'});
  app.innerHTML=hh+'<button class="btn2" onclick="location.hash=\'#/quiz/1\'">처음부터 다시</button><button class="btn2" onclick="location.hash=\'#/list\'">전체 원두 보기</button></div>';return}
 if(!st.a.acid||!st.a.ch){location.hash='#/quiz/1';return}var r=recommend(st.a);
 var h=top('추천 결과')+'<div class="pad"><p class="q">당신을 위한 원두 '+r.length+'가지</p><p class="qsub">'+'산미 '+esc(ACID[st.a.acid][0])+' · '+esc(st.a.ch=='any'?'향 상관없음':st.a.ch)+'</p>';
 r.forEach(function(x,i){h+='<div class="rcard" data-char="'+tc(x.b)+'">'+card(x.b,{rank:(i+1)+'순위',why:'추천 이유: '+(x.why.length?x.why.join(' · ')+'에 맞아요':'선택하신 산미 취향과 가장 가까워요')})+buy(x.b,'sm')+'</div>';});
 app.innerHTML=h+'<button class="btn2" onclick="location.hash=\'#/quiz/1\'">처음부터 다시</button><button class="btn2" onclick="location.hash=\'#/list\'">전체 원두 보기</button></div>'}
function list(f){var h=top('전체 원두')+'<div class="pad"><div class="chips">';
 ['전체','과일','꽃','초콜릿'].forEach(function(c){h+='<button class="chip'+((f||'전체')==c?' on':'')+'" data-c="'+c+'">'+c+'</button>'});h+='</div>';
 var bs=B.filter(function(b){return !f||f=='전체'||b.characters.indexOf(f)>=0}).sort(function(x,y){return x.acidityRank-y.acidityRank});
 h+='<div class="sec">산미 순서로 보기 <span class="muted" style="font-weight:600">('+bs.length+'개)</span></div><div class="adir"><span>← 신맛 강함</span><span>신맛 약함 →</span></div><div class="agrad"><i id="apos"></i></div>';
 h+='<div class="slider" id="sl">';bs.forEach(function(b){h+='<button class="scard" data-char="'+tc(b)+'" onclick="location.hash=\'#/bean/'+b.id+'\'"><span class="srank">산미 '+b.acidityRank+'위</span><img src="'+b.image+'" alt="" loading="lazy"><b>'+esc(b.name)+'</b><span class="skw">'+esc(b.keywords.slice(0,2).join(' · '))+'</span><span class="schar">'+esc(b.characters.join(' · '))+'</span></button>'});
 h+='</div><p class="muted" style="text-align:center;margin-top:6px">옆으로 밀어서 더 보기</p></div>';app.innerHTML=h;
 app.querySelectorAll('.chip').forEach(function(el){el.onclick=function(){st.filter=el.dataset.c;list(st.filter)}});
 var sl=document.getElementById('sl'),ap=document.getElementById('apos');function up(){var m=sl.scrollWidth-sl.clientWidth;var w=Math.max(8,sl.clientWidth/sl.scrollWidth*100);ap.style.width=w+'%';ap.style.left=(m>0?sl.scrollLeft/m*(100-w):0)+'%'}sl.addEventListener('scroll',up,{passive:true});up()}
function bars(v,max){var s='<div class="bar">';for(var i=1;i<=max;i++)s+='<i class="'+(v!=null&&i<=v?'on':'')+'"></i>';return s+'</div><em>'+(v==null?'-':v+'/'+max)+'</em>'}
function info(b){var h='<div class="card"><div class="sec" style="margin-top:0">로스팅 레벨</div><div class="roast">';
 for(var i=1;i<=7;i++)h+='<i class="'+(i==b.roast.position?'on':'')+'" style="background:'+ROAST[i-1]+'"></i>';
 h+='</div><div class="roastlbl"><span>약</span><span>중</span><span>강</span></div><div class="muted" style="margin-top:6px">TIME '+esc(b.roast.time||'-')+'</div></div>';
 h+='<div class="card"><div class="sec" style="margin-top:0">맛 밸런스</div>';for(var k in b.meters)h+='<div class="meter"><label>'+k+'</label>'+bars(b.meters[k],5)+'</div>';
 h+='</div><div class="card"><div class="sec" style="margin-top:0">이렇게 즐겨보세요</div>';for(var m in b.menus)h+='<div class="meter menu"><label style="width:150px">'+m+'</label>'+bars(b.menus[m],5)+'</div>';
 h+='</div><div class="card"><div class="sec" style="margin-top:0">생두 특징</div>';
 var gb=b.greenBean||[];gb.forEach(function(g){h+='<div class="gb">'+(gb.length>1||b.group=='blend'?'<div class="gbh">'+esc(g['국가'])+'</div>':'');
  ['재배지','생산자','원두','가공법','품종','고도'].forEach(function(f){if(g[f])h+='<div class="gbr"><span>'+f+'</span><b>'+esc(g[f])+'</b></div>'});h+='</div>'});
 h+='</div>';return h}
function fmt(t){return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')}
function recipe(b,ri){var R=b.recipes||[];if(!R.length)return '<div class="card empty"><div class="ico">☕️</div><b>레시피 준비 중</b><p>곧 이 원두에 맞는 추출 레시피를 알려드릴게요.</p></div>';
 ri=Math.min(ri||0,R.length-1);var r=R[ri],h='<div class="chips">';R.forEach(function(x,i){h+='<button class="chip'+(i==ri?' on':'')+'" data-r="'+i+'">'+esc(x.title)+'</button>'});
 h+='</div><div class="card">'+(r.sample?'<div class="sample">※ 샘플 레시피입니다 (화면 시연용, 추후 정식 데이터로 교체 예정)</div>':'')+'<b style="font-size:19px">'+esc(r.title)+'</b> <span class="muted">'+esc(r.subtitle||'')+'</span><div class="kv" style="margin-top:12px">';
 (r.items||[]).forEach(function(it){h+='<div><small>'+esc(it.label)+'</small><b>'+esc(it.value==null?'-':it.value)+'</b></div>'});h+='</div>';
 if(r.steps&&r.steps.length){h+='<ol class="steps">';r.steps.forEach(function(s,i){h+='<li data-t="'+s.time+'"><span class="t">'+fmt(s.time)+'</span><span>'+(s.label?'<b>('+esc(s.label)+')</b> ':'')+esc(s.text)+'</span></li>'});
  h+='</ol><div class="timer"><div class="clock" id="clk">00:00</div><button class="go" id="tgo">시작</button><button id="trs">리셋</button></div>'}
 if(r.note)h+='<p class="desc" style="margin-top:14px">💡 '+esc(r.note)+'</p>';return h+'</div>'}
function bindRecipe(b){app.querySelectorAll('[data-r]').forEach(function(el){el.onclick=function(){stopTimer();st.ri=+el.dataset.r;(st.reRecipe||function(){detail(b.id,'recipe')})()}});
 var go=document.getElementById('tgo');if(!go)return;var t=0,run=false,clk=document.getElementById('clk'),lis=app.querySelectorAll('.steps li');
 function paint(){clk.textContent=fmt(t);var cur=-1;lis.forEach(function(li,i){if(t>=+li.dataset.t)cur=i});lis.forEach(function(li,i){li.className=(run||t>0)?(i==cur?'cur':i<cur?'done':''):''})}
 go.onclick=function(){if(run){stopTimer();run=false;go.textContent='계속'}else{run=true;go.textContent='일시정지';timer={h:setInterval(function(){t++;paint()},1000)}}paint()};
 document.getElementById('trs').onclick=function(){stopTimer();run=false;t=0;go.textContent='시작';paint()}}
var CHO={'과일':['geisha-natural','muntasha','yirga-natural','alaskana','peach-sorbet','kenya-kiangundo'],'꽃':['bishala','geisha-dios','geisha-washed','yirga-washed-medium','colombia-highend','colombia-magdalena'],'초콜릿':['yirga-washed-mediumdark','mary-glow','ember','guatemala-mediumdark','brazil-caramelado','mocha-mousse','mood-indigo','guatemala-dark']};
var CHC={'과일':'#E3A396','꽃':'#E6CF7A','초콜릿':'#A88470'};
var RM={1:['guatemala-mediumdark','colombia-magdalena','kenya-kiangundo','yirga-washed-mediumdark','mary-glow','ember'],2:['yirga-washed-medium','peach-sorbet','colombia-highend','bishala','yirga-natural'],3:['brazil-caramelado','mocha-mousse','guatemala-dark','mood-indigo'],4:['muntasha','alaskana','geisha-washed','geisha-dios','geisha-natural']};
function dots(n){var s='<span class="dots">';for(var i=1;i<=4;i++)s+='<i class="'+(i<=n?'f'+i:'')+'"></i>';return s+'</span>'}
function pos(b){var h='<div class="possum">산미 '+b.acidityRank+'위 · '+esc(b.characters.join(' · '))+' 캐릭터 · 로드맵 '+b.roadmapStep+'단계 \''+STEPS[b.roadmapStep][0]+'\'</div>';
 var A=B.slice().sort(function(x,y){return x.acidityRank-y.acidityRank});
 h+='<div class="card"><div class="sec" style="margin-top:0"><span class="sn">01</span> 산미 포지셔닝</div><div class="lhead"><span>산미</span><span>원두 이름</span><span>쌉쌀함</span></div><div class="lad">';
 A.forEach(function(x){var r=x.acidityRank,c='hsl(38,'+(70-r*1.5)+'%,'+(72-r*2.4)+'%)';h+='<div class="lr'+(x.id==b.id?' me':'')+'"><span class="ld" style="background:'+c+'"></span><span class="lk">'+(r==1?'High':r==13?'MID':r==20?'Low':'')+'</span><span class="ln">'+esc(x.name)+'</span>'+dots(x.bitterness)+'</div>'});
 h+='</div></div><div class="card"><div class="sec" style="margin-top:0"><span class="sn">02</span> 캐릭터 포지셔닝</div><div class="lad">';
 ['과일','꽃','초콜릿'].forEach(function(g){CHO[g].forEach(function(id,i){var x=byId(id);h+='<div class="lr'+(id==b.id?' me':'')+'"><span class="ld" style="background:'+CHC[g]+'"></span><span class="lk">'+(i==0?g:'')+'</span><span class="ln">'+esc(x.name)+(x.characters.length>1?' <small class="multi">'+esc(x.characters.join(' · '))+'</small>':'')+'</span></div>'})});
 h+='</div></div><div class="card"><div class="sec" style="margin-top:0"><span class="sn">03</span> 테이스팅 로드맵</div>';var n=0;
 for(var s=1;s<=4;s++){h+='<div class="rs s'+s+(s==b.roadmapStep?' on':'')+'"><div class="rt"><span class="rb">STEP '+s+'</span><b>'+STEPS[s][0]+'</b></div><div class="muted">'+STEPS[s][1]+'</div><div class="rc">';
  RM[s].forEach(function(id){n++;h+='<span class="'+(id==b.id?'me':'')+'"><em>'+n+'</em>'+esc(byId(id).name)+'</span>'});h+='</div></div>'}
 return h+'</div>'}
function detail(id,tab){var b=byId(id);if(!b){home();return}tab=tab||'info';
 var h=top(b.name)+'<div class="hero"><img src="'+b.image+'" alt="'+esc(b.name)+' 패키지"></div><div class="pad" style="padding-top:4px"><div class="dname">'+esc(b.name)+'</div><div class="den">'+esc(b.nameEn)+'</div><div class="tags">';
 b.keywords.forEach(function(k){h+='<span class="tag">'+esc(k)+'</span>'});h+='</div><p class="desc">'+esc(b.description)+'</p>';
 h+='<div class="tabs"><button data-tab="info" class="'+(tab=='info'?'on':'')+'">정보</button><button data-tab="pos" class="'+(tab=='pos'?'on':'')+'">포지션</button><button data-tab="recipe" class="'+(tab=='recipe'?'on':'')+'">레시피</button></div>';
 h+=tab=='info'?info(b):tab=='pos'?pos(b):recipe(b,st.ri);app.innerHTML=h+'</div><div class="buybar">'+buy(b)+'</div>';app.classList.add('hasbar');app.setAttribute('data-char',tc(b));
 if(tab=='pos'){var tb=app.querySelector('.tabs');setTimeout(function(){window.scrollTo(0,tb.getBoundingClientRect().top+window.scrollY-64)},0)}
 if(tab=='pos')app.querySelectorAll('.lad').forEach(function(l){var x=l.querySelector('.me');if(x)l.scrollTop=x.offsetTop-l.clientHeight/2+x.offsetHeight/2});
 app.querySelectorAll('[data-tab]').forEach(function(el){el.onclick=function(){stopTimer();history.replaceState(null,'','#/bean/'+id+(el.dataset.tab!='info'?'/'+el.dataset.tab:''));route()}});
 if(tab=='recipe')bindRecipe(b)}
function roadmap(){var h=top('추천 테이스팅 로드맵')+'<div class="pad"><p class="q">테이스팅 로드맵</p><p class="qsub">1단계부터 순서대로 마셔보세요. 익숙한 맛에서 특별한 맛으로 넓혀가요.</p>';
 for(var s=1;s<=4;s++){h+='<div class="rmstep s'+s+'"><div class="rmhead"><span class="rmnum">'+s+'</span><div><b>STEP '+s+' · '+esc(STEPS[s][0])+'</b><span>'+esc(STEPS[s][1])+'</span></div></div>';
  var ids=RM[s].filter(byId);B.forEach(function(b){if(b.roadmapStep==s&&ids.indexOf(b.id)<0)ids.push(b.id)});
  ids.forEach(function(id,i){h+=card(byId(id),{rank:s+'-'+(i+1)})});h+='</div>'+(s<4?'<div class="rmarrow" aria-hidden="true">↓</div>':'')}
 app.innerHTML=h+'<button class="btn2" onclick="location.hash=\'\'">홈으로</button></div>'}
var MNAME={handdrip:'핸드드립 레시피',espresso:'에스프레소 레시피'};
function roastLabel(p){return p==null?null:p<=2?'약배전':p<=4?'중배전':p==5?'중강배전':'강배전'}
function procLabel(b){var ps=(b.greenBean||[]).map(function(g){return g['가공법']});if(!ps.length||ps.some(function(x){return !x}))return null;
 var u=ps.filter(function(x,i){return ps.indexOf(x)==i});u.sort();return u.length==1?u[0]:u.join(' + ')+' 블렌드'}
function recipesHome(){app.innerHTML=top('레시피 탐색')+'<div class="pad"><p class="q">어떤 방식으로 내리시나요?</p><p class="qsub">추출 방식을 골라주세요</p>'+
 '<button class="opt" onclick="location.hash=\'#/recipes/handdrip\'"><span class="num">☕</span><div><b>핸드드립 레시피</b><span>V60 등 드리퍼로 내리기</span></div></button>'+
 '<button class="opt" onclick="location.hash=\'#/recipes/espresso\'"><span class="num">⚡</span><div><b>에스프레소 레시피</b><span>에스프레소 · 아메리카노</span></div></button></div>'}
function rcount(b,m){return (b.recipes||[]).filter(function(r){return r.method==m}).length}
function rcard(b,m){var n=rcount(b,m);return '<button class="bean" data-char="'+tc(b)+'" onclick="location.hash=\'#/recipe/'+b.id+'/'+m+'\'"><img src="'+b.image+'" alt="" loading="lazy"><div><b>'+esc(b.name)+'</b><span>'+esc(b.keywords.join(' · '))+'</span><span class="why">'+(n?'레시피 '+n+'개'+((b.recipes||[]).some(function(r){return r.method==m&&r.sample})?' (샘플)':''):'레시피 준비 중')+'</span></div></button>'}
function recipesList(m,tab){if(!MNAME[m]){recipesHome();return}tab=tab||'bean';
 var h=top(MNAME[m])+'<div class="pad"><div class="tabs" style="margin-top:0"><button class="'+(tab=='bean'?'on':'')+'" onclick="location.replace(\'#/recipes/'+m+'/bean\')">원두별 탐색</button><button class="'+(tab=='feature'?'on':'')+'" onclick="location.replace(\'#/recipes/'+m+'/feature\')">특징별 탐색</button></div>';
 if(tab=='bean'){h+='<p class="muted">원두를 누르면 '+MNAME[m]+'를 볼 수 있어요</p>';B.slice().sort(function(x,y){return x.acidityRank-y.acidityRank}).forEach(function(b){h+=rcard(b,m)})}
 else{var G={},U=[],RO=['약배전','중배전','중강배전','강배전'];B.forEach(function(b){var r=roastLabel(b.roast&&b.roast.position),p=procLabel(b);if(!r||!p){U.push(b);return}var k=r+' · '+p;(G[k]=G[k]||{r:r,p:p,l:[]}).l.push(b)});
  var ks=Object.keys(G).sort(function(a,c){return RO.indexOf(G[a].r)-RO.indexOf(G[c].r)||a.localeCompare(c,'ko')});
  h+='<p class="muted">배전도 × 가공법 카테고리 · 카테고리별 레시피는 준비 중이에요</p>';
  ks.forEach(function(k){h+='<div class="sec">'+esc(k)+' <span class="muted">('+G[k].l.length+')</span></div>';G[k].l.forEach(function(b){h+=rcard(b,m)})});
  if(U.length){h+='<div class="sec">가공법 정보 확인 중 <span class="muted">('+U.length+')</span></div><p class="muted" style="margin-top:-6px">상세페이지에 구성 원두의 가공법이 모두 적혀 있지 않은 블렌드예요</p>';U.forEach(function(b){h+=rcard(b,m)})}}
 app.innerHTML=h+'</div>'}
function recipeView(id,m){var b=byId(id);if(!b||!MNAME[m]){home();return}var v={};for(var k in b)v[k]=b[k];v.recipes=(b.recipes||[]).filter(function(r){return r.method==m});
 app.innerHTML=top(MNAME[m])+'<div class="pad" data-char="'+tc(b)+'"><button class="bean" data-char="'+tc(b)+'" onclick="location.hash=\'#/bean/'+b.id+'\'"><img src="'+b.image+'" alt=""><div><b>'+esc(b.name)+'</b><span>원두 상세 보기 →</span></div></button>'+recipe(v,st.ri)+'</div>';
 st.reRecipe=function(){recipeView(id,m)};bindRecipe(v)}
function knowhow(id){var K=window.KNOWHOW||[];if(id){var it=K.filter(function(x){return x.id==id})[0];if(!it){location.hash='#/know-how';return}
  var h=top(it.title)+'<div class="pad"><p class="q">'+esc(it.icon||'')+' '+esc(it.title)+'</p>';
  h+=(it.body&&it.body.length)?it.body.map(function(p){return '<p class="desc">'+esc(p)+'</p>'}).join(''):'<div class="card empty"><div class="ico">📝</div><b>내용 준비 중</b><p>곧 그냥커피의 노하우를 알려드릴게요.</p></div>';app.innerHTML=h+'</div>';return}
 var h=top('커피 노하우')+'<div class="pad"><p class="q">커피 노하우</p><p class="qsub">알고 싶은 주제를 골라주세요</p>';
 K.forEach(function(x){h+='<button class="opt" onclick="location.hash=\'#/know-how/'+x.id+'\'"><span class="num">'+esc(x.icon||'•')+'</span><div><b>'+esc(x.title)+'</b>'+(x.body&&x.body.length?'':'<span>준비 중</span>')+'</div></button>'});app.innerHTML=h+'</div>'}
function route(){st.reRecipe=null;stopTimer();closeSheet();app.classList.remove('hasbar');app.removeAttribute('data-char');var p=location.hash.replace(/^#\/?/,'').split('/');window.scrollTo(0,0);
 if(p[0]=='quiz')quiz(+p[1]||1);else if(p[0]=='result')result();else if(p[0]=='roadmap')roadmap();else if(p[0]=='recipes'){if(p[1])recipesList(p[1],p[2]);else recipesHome()}else if(p[0]=='recipe')recipeView(decodeURIComponent(p[1]),p[2]);else if(p[0]=='know-how')knowhow(p[1]);else if(p[0]=='list')list(st.filter);
 else if(p[0]=='bean'){if(st.last!=p[1])st.ri=0;st.last=p[1];detail(decodeURIComponent(p[1]),p[2])}else home()}
window.addEventListener('hashchange',route);route();
window.__recommend=recommend;window.__LOWMAP=LOWMAP;
})();
