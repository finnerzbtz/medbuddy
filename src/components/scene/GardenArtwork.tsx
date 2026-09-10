import type { BlobbyVariant } from '@/types';

/** Original cel artwork, in local coordinates so hands, can and water share a rig. */
export function GardenBlobby({ outfit }: { outfit: BlobbyVariant }) {
  const coat = outfit === 'raincoat',
    wool = outfit === 'sweater';
  const sleeve = coat ? '#f4c64d' : wool ? '#d3b392' : '#fff8e5';
  return (
    <g stroke="#202d42" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
      <g className="garden-feet" fill={coat ? '#d79831' : '#fff8e5'}>
        <path d="M-49-21Q-63 2-52 10Q-25 19-17 6L-13-16Z" />
        <path d="M17-17L19 8Q39 21 57 8L50-21Z" />
        <path d="M-51 7L-24 9M26 10L49 8" stroke={coat ? '#99632a' : '#d2cbba'} strokeWidth="2" />
      </g>
      <path
        d="M-84-65C-98-120-69-235-5-244C70-254 103-130 85-64Q72-14 1-12Q-68-9-84-65Z"
        fill="#fff8e5"
      />
      <path
        d="M47-219C82-167 84-91 63-59Q43-25-19-27Q42-2 75-36C110-79 93-184 47-219Z"
        fill="#d9ddce"
        stroke="none"
      />
      <path d="M-62-128Q-63-188-24-216" fill="none" stroke="#fffef7" strokeWidth="9" />
      {coat && (
        <>
          <path
            d="M-89-133C-110-208-53-269-3-264C61-269 115-205 91-130L70-115C88-178 50-239-4-235C-64-235-91-169-69-116Z"
            fill="#f4c64d"
          />
          <path d="M24-260Q107-227 92-133L78-120Q97-208 24-260Z" fill="#d89a34" stroke="none" />
          <path d="M-85-130Q0-101 85-130L96-39Q2-5-96-37Z" fill="#f4c64d" />
          <path d="M56-116L77-44Q40-28 18-31L13-112Z" fill="#e7ae38" stroke="none" />
          <path d="M-71-130L-39-98L-3-111L36-95L72-130" fill="#ffe393" strokeWidth="2.8" />
          <path d="M0-109L4-27" stroke="#ac7e31" strokeWidth="2" />
          <path
            d="M-84-44Q0-21 83-44"
            fill="none"
            stroke="#a87b36"
            strokeWidth="1.5"
            strokeDasharray="3 5"
          />
          <path d="M-57-76L-29-72L-31-52L-56-55Z" fill="#f8d570" strokeWidth="2" />
          <g fill="#72552c" stroke="none">
            <circle cx="4" cy="-87" r="3" />
            <circle cx="5" cy="-61" r="3" />
          </g>
        </>
      )}
      {wool && (
        <>
          <path d="M-85-128Q-5-98 85-128L93-39Q-1-10-94-39Z" fill="#d3b392" />
          <path
            d="M-70-123Q0-103 70-123M-84-44Q0-25 83-44"
            fill="none"
            stroke="#a18467"
            strokeWidth="8"
          />
          <path
            d="M-60-97l10 8-10 8 10 8M-31-92l10 8-10 8 10 8M5-91l10 8-10 8 10 8M40-96l10 8-10 8 10 8"
            fill="none"
            stroke="#ead5b5"
            strokeWidth="3"
          />
        </>
      )}
      {!coat && !wool && (
        <path d="M-84-128Q0-78 84-129" fill="none" stroke="#b0c3b6" strokeWidth="2.5" />
      )}
      <g className="garden-cheeks" fill="#eaa8a2" stroke="none" opacity=".65">
        <ellipse cx="-47" cy="-160" rx="11" ry="6" />
        <ellipse cx="48" cy="-160" rx="11" ry="6" />
      </g>
      <g className="garden-eyes" fill="#202d42" stroke="none">
        <ellipse cx="-28" cy="-178" rx="6.5" ry="10" />
        <ellipse cx="25" cy="-178" rx="6.5" ry="10" />
        <circle cx="-30" cy="-181" r="2" fill="#fff" />
        <circle cx="23" cy="-181" r="2" fill="#fff" />
      </g>
      <g className="garden-happy-eyes" fill="none" strokeWidth="4.5" visibility="hidden">
        <path d="M-36-175Q-28-186-20-175M17-175Q25-186 33-175" />
      </g>
      {outfit === 'glasses' && (
        <g fill="none" stroke="#5b4d46" strokeWidth="3.2">
          <circle cx="-28" cy="-178" r="20" />
          <circle cx="25" cy="-178" r="20" />
          <path d="M-8-180Q0-187 5-180M-49-179L-66-184M46-179L64-185" />
        </g>
      )}
      {(wool || outfit === 'glasses') && (
        <g>
          <path d="M-99-224Q-62-246 71-239L109-217Q8-185-99-224Z" fill="#e9c383" />
          <path d="M-64-234Q-59-287-11-293Q43-301 65-238Q2-215-64-234Z" fill="#f1d393" />
          <path d="M-63-239Q-2-220 64-243L68-234Q0-211-66-230Z" fill="#a58452" strokeWidth="2" />
          <g fill="none" stroke="#bc9861" strokeWidth="1.2">
            <path d="M-44-263Q0-246 47-263M-36-275Q-3-262 31-276M-84-222Q0-204 87-218M-39-284L-43-239M-14-290L-16-235M12-289L13-234M35-279L42-237" />
          </g>
        </g>
      )}
      {outfit === 'frog' && (
        <g data-outfit="frog">
          <path
            d="M-88-129C-112-200-65-268-4-263C70-270 110-205 89-130L72-121C85-175 50-233-3-234C-61-233-86-177-69-120Z"
            fill="#80a971"
          />
          <circle cx="-49" cy="-253" r="24" fill="#80a971" />
          <circle cx="49" cy="-253" r="24" fill="#80a971" />
          <g fill="#e3e6ad">
            <circle cx="-49" cy="-255" r="14" />
            <circle cx="49" cy="-255" r="14" />
          </g>
          <g fill="#26362c" stroke="none">
            <ellipse cx="-49" cy="-255" rx="5" ry="8" />
            <ellipse cx="49" cy="-255" rx="5" ry="8" />
          </g>
          <path d="M0-120Q-32-139-31-117Q-25-102 0-118Q32-139 31-117Q25-102 0-118" fill="#80a971" />
        </g>
      )}
      {outfit === 'starlight' && (
        <g data-outfit="starlight">
          <path d="M-74-228Q-35-296 38-302Q84-303 81-259Q51-281 47-254L76-231Z" fill="#7b7faf" />
          <path d="M-74-228Q0-207 76-231" fill="none" stroke="#e9c26b" strokeWidth="11" />
          <circle cx="82" cy="-258" r="12" fill="#e9c26b" />
          <path
            d="M-20-276L-13-262 3-259-9-248-7-232-21-240-35-232-33-248-45-259-28-262Z"
            fill="#e9c26b"
            strokeWidth="2"
          />
          <path d="M-81-126Q0-99 81-126L78-109Q0-85-80-109Z" fill="#7b7faf" />
          <path d="M47-112L47-52Q64-41 75-53L71-116Z" fill="#7b7faf" />
        </g>
      )}
      {outfit === 'strawberry' && (
        <g data-outfit="strawberry">
          <ellipse cx="0" cy="-238" rx="88" ry="28" fill="#ca7d92" />
          <path d="M0-261L-25-269-5-274 0-288 8-275 28-272 8-262Z" fill="#739466" />
          <path d="M-8-271L-5-291 4-297" fill="none" stroke="#739466" strokeWidth="6" />
          <path d="M-50-89Q0-107 51-88L58-31Q0-9-56-33Z" fill="#ca7d92" />
          <path d="M-41-83L-41-119M39-83L40-119" stroke="#739466" strokeWidth="8" />
          <path d="M-16-60Q0-70 18-61L16-42Q0-32-15-44Z" fill="#eddfbf" strokeWidth="2" />
        </g>
      )}
      <g className="garden-far-arm" transform="rotate(12 -70 -110)">
        <path d="M-78-120Q-108-111-101-78Q-85-62-72-85L-63-108Z" fill={sleeve} />
        <path d="M-97-87L-79-80" stroke="#202d4255" strokeWidth="2" />
      </g>
      <g className="garden-can" transform="translate(103 -131)">
        <GardenCan />
      </g>
      <g className="garden-grip">
        <path d="M71-113Q48-132 58-145Q67-156 82-146L94-135Q86-115 71-113Z" fill={sleeve} />
        <path d="M65-140L77-131" stroke="#202d4244" strokeWidth="2" />
      </g>
      <path d="M-65-193L-67-178" stroke="#fffef7" strokeWidth="5" />
    </g>
  );
}

export function GardenCan() {
  return (
    <g stroke="#202d42" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M-33-22Q-88-56-83-9Q-81 15-42 20" fill="none" stroke="#202d42" strokeWidth="14" />
      <path d="M-33-22Q-88-56-83-9Q-81 15-42 20" fill="none" stroke="#59bdc9" strokeWidth="7" />
      <path d="M28-12L107-55L126-34L37 31Z" fill="#54bcc9" />
      <path d="M36 14L114-42L119-33L39 30Z" fill="#348a9f" stroke="none" />
      <path d="M-47-36L38-36L42 35Q0 58-51 34Z" fill="#69ced4" />
      <path d="M19-32L38-32L42 34Q29 42 17 43Z" fill="#3697ad" stroke="none" />
      <ellipse cx="-5" cy="-35" rx="42" ry="11" fill="#275d78" />
      <ellipse cx="-5" cy="-34" rx="30" ry="6" fill="#91e8e7" stroke="none" />
      <path d="M-34-19L-35 21" stroke="#d7ffef" strokeWidth="7" />
      <path d="M-29 34Q-10 39 7 37" fill="none" stroke="#baffed" strokeWidth="3" />
      <path d="M103-59Q109-65 114-60L134-36Q138-29 131-25L121-24L98-51Z" fill="#c7f3dc" />
      <path d="M108-55L126-34" stroke="#557f88" strokeDasharray="1 6" strokeWidth="3" />
      <path d="M-15-8L-4-14L7-7L4 7L-6 15L-16 7Z" fill="#e7f5ca" strokeWidth="2" />
      <path d="M-6 9V-7M-6 0L0-4M-6 4L-11-1" fill="none" stroke="#6a9172" strokeWidth="1.5" />
    </g>
  );
}

const clouds = [
  {
    d: 'M-127-137Q-143-166-115-179Q-117-211-84-207Q-65-232-41-211Q-7-219 5-194Q26-175 4-155Q-60-125-127-137Z',
    x: -62,
    y: -176,
  },
  {
    d: 'M-5-188Q-21-217 9-230Q18-262 47-248Q80-262 92-237Q126-238 123-209Q102-183 60-180Z',
    x: 63,
    y: -216,
  },
  {
    d: 'M-85-248Q-107-266-88-285Q-79-315-55-304Q-28-329-6-307Q29-308 30-279Q19-251-21-245Z',
    x: -37,
    y: -279,
  },
];
export const blossomPositions = [
  [-98, -176],
  [-69, -204],
  [-26, -182],
  [-62, -157],
  [14, -218],
  [47, -242],
  [91, -221],
  [57, -197],
  [-65, -278],
  [-38, -302],
  [0, -280],
  [-18, -255],
  [-106, -152],
  [-37, -216],
  [105, -205],
  [12, -297],
];
export function Blossom({ large = false }: { large?: boolean }) {
  return (
    <g fill="currentColor" stroke="#9c4261" strokeWidth={large ? '1.2' : '.8'}>
      {[0, 72, 144, 216, 288].map((a) => (
        <path
          key={a}
          transform={`rotate(${a})`}
          d="M0 1Q-15-5-12-16L-5-23L0-19L5-23L12-16Q15-5 0 1Z"
        />
      ))}
      <circle r="4" fill="#ffce77" stroke="none" />
      <path d="M0-8V-5M-7-3L-4-1M7-3L4-1M-4 6L-2 3M4 6L2 3" stroke="#c27c47" />
    </g>
  );
}
export function GardenBonsai() {
  return (
    <g stroke="#202d42" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
      <g className="garden-tree-crown">
        <path
          d="M-23-2Q17-38-3-69Q-30-106-3-131Q14-151-1-192L17-218Q40-172 22-132Q-2-98 26-58Q38-30 17 0Z"
          fill="#b98869"
        />
        <path d="M5-9Q26-42 4-72Q-16-108 10-139" fill="none" stroke="#775f59" strokeWidth="9" />
        <path
          d="M3-95Q-28-143-66-162L-72-191M14-137Q64-158 74-207M6-193Q-9-225-36-263"
          fill="none"
          stroke="#202d42"
          strokeWidth="13"
        />
        <path
          d="M3-95Q-28-143-66-162L-72-191M14-137Q64-158 74-207M6-193Q-9-225-36-263"
          fill="none"
          stroke="#b98869"
          strokeWidth="7"
        />
        {clouds.map(({ d, x, y }, i) => (
          <g key={i}>
            <path className="garden-leaf-mass" d={d} />
            <path
              d={`M${x - 47} ${y + 18}q40 19 79-7`}
              fill="none"
              stroke="#203c4555"
              strokeWidth="8"
            />
            <path
              d={`M${x - 36} ${y - 10}q24-20 57-6`}
              fill="none"
              stroke="#d7eab599"
              strokeWidth="5"
            />
            <g fill="#28384d" stroke="none" opacity=".3">
              {Array.from({ length: 9 }, (_, n) => (
                <circle key={n} cx={x - 37 + (n % 5) * 17} cy={y + Math.floor(n / 5) * 14} r="2" />
              ))}
            </g>
          </g>
        ))}
        <g className="garden-tree-flowers" visibility="hidden">
          {blossomPositions.map(([x, y], i) => (
            <g key={i} className="garden-blossom" transform={`translate(${x} ${y})`}>
              <g>
                <Blossom />
              </g>
            </g>
          ))}
        </g>
      </g>
      <ellipse cy="5" rx="87" ry="22" fill="#92aa93" opacity=".4" stroke="none" />
      <path d="M-83-3L-68 47Q0 72 68 47L83-3Z" fill="#cf816b" />
      <path d="M41-2L35 53L65 47L80 1Z" fill="#aa5f60" stroke="none" />
      <path d="M-67 43Q0 62 65 43" fill="none" stroke="#ebaa82" strokeWidth="4" />
      <ellipse cy="-2" rx="86" ry="18" fill="#916959" />
      <path d="M-81-1Q0 18 81-1" fill="none" stroke="#f4b98a" strokeWidth="5" />
      <path d="M-49-4Q-38-16-22-8Q-10-18 5-8Q24-14 35-4Q5 7-49-4Z" fill="#678b74" strokeWidth="2" />
      <g stroke="none" fill="#bea68b">
        <ellipse cx="49" cy="-2" rx="10" ry="4" />
        <ellipse cx="-62" cy="-5" rx="5" ry="3" />
      </g>
      <path d="M-9 34Q0 18 9 34Q1 47-9 34Z" fill="#ffd9a0" strokeWidth="1.5" />
    </g>
  );
}

export function GardenDefs() {
  return (
    <defs>
      <radialGradient id="garden-indigo">
        <stop stopColor="#344c78" />
        <stop offset="1" stopColor="#172238" />
      </radialGradient>
      <radialGradient id="garden-aqua">
        <stop stopColor="#b8f6de" />
        <stop offset=".5" stopColor="#50b7c7" />
        <stop offset="1" stopColor="#23496d" />
      </radialGradient>
      <radialGradient id="garden-rose">
        <stop stopColor="#fff3ce" />
        <stop offset=".6" stopColor="#f6c2b9" />
        <stop offset="1" stopColor="#c87c91" />
      </radialGradient>
      <linearGradient id="garden-ribbon" x1="0" y1="0" x2="1" y2="0">
        <stop stopColor="#1f91b5" />
        <stop offset=".5" stopColor="#95f7e7" />
        <stop offset="1" stopColor="#e2ffec" />
      </linearGradient>
      <pattern id="garden-dots" width="13" height="13" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="1.3" fill="#102139" opacity=".2" />
      </pattern>
      <pattern id="garden-seigaiha" width="140" height="70" patternUnits="userSpaceOnUse">
        <g fill="none" stroke="#fff4dd" strokeWidth="1.6" opacity=".055">
          <path d="M-70 70a70 70 0 0 1 140 0m-125 0a55 55 0 0 1 110 0m-95 0a40 40 0 0 1 80 0m-65 0a25 25 0 0 1 50 0M70 70a70 70 0 0 1 140 0m-125 0a55 55 0 0 1 110 0m-95 0a40 40 0 0 1 80 0" />
        </g>
      </pattern>
      <symbol id="garden-petal" viewBox="-15 -25 30 50">
        <path
          d="M0 18Q-24-1-8-21L0-14L8-21Q24-1 0 18Z"
          fill="currentColor"
          stroke="#a75773"
          strokeWidth="1.2"
        />
      </symbol>
      <symbol id="garden-star" viewBox="-20 -20 40 40">
        <path d="M0-20L5-5L20 0L5 5L0 20L-5 5L-20 0L-5-5Z" fill="currentColor" />
      </symbol>
    </defs>
  );
}
