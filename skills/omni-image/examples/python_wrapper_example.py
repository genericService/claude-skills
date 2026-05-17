import subprocess
import os

prompts = [
    {
        "name": "grok_v1_boxing.png",
        "prompt": "SCENE: A vintage 1950s boxing match undercard poster. A massive fight card list dominates the center. The exact text reads: '1. DOG HAUS', '2. LITTLE DRUNK', '3. NETFLIX', '4. ORAL EXAM', '5. SLEEP', '6. MORNING PICK ME UP', '7. COFFEE', '8. OFF TO WORK'. Two rugged boxers exchange blows at the bottom. STYLE: Vintage 1950s boxing letterpress print, distressed ink, bold sans-serif typography, block letters. MOOD: Gritty, nostalgic, high-stakes, aggressive energy. LIGHTING: Harsh overhead arena spotlight, stark shadows. CAMERA: Flattened graphic illustration, high contrast, heavy halftone dot texture."
    },
    {
        "name": "grok_v2_heavy_metal.png",
        "prompt": "SCENE: A heavy metal tour itinerary poster. A flaming skull bites through a calendar page. The back-of-shirt style tour dates list the exact text: 'DOG HAUS', 'LITTLE DRUNK', 'NETFLIX', 'ORAL EXAM', 'SLEEP', 'MORNING PICK ME UP', 'COFFEE', 'OFF TO WORK'. STYLE: 1980s thrash metal album art, airbrushed chrome, jagged gothic typography, neon green and hot pink ink. MOOD: Demonic, loud, aggressive, chaotic, absurdly epic. LIGHTING: Glowing radioactive underlighting, deep black voids. CAMERA: Vector graphic tee design, crisp edges, glowing neon halation."
    },
    {
        "name": "grok_v3_clinical.png",
        "prompt": "SCENE: A highly detailed, sterile medical flow chart infographic. Clean geometric lines connect precise boxes. The exact text inside the boxes reads chronologically: '1: DOG HAUS', '2: LITTLE DRUNK', '3: NETFLIX', '4: ORAL EXAM', '5: SLEEP', '6: MORNING PICK ME UP', '7: COFFEE', '8: OFF TO WORK'. STYLE: 1970s Swiss modernism, Swiss typography, Helvetica, minimalist vector graphics, pastel blue and sterile white. MOOD: Cold, clinical, hyper-rational, oppressively organized. LIGHTING: Flat, shadowless, even fluorescent illumination. CAMERA: Perfect orthographic projection, razor-sharp vector lines, no grain."
    },
    {
        "name": "grok_v4_tapestry.png",
        "prompt": "SCENE: A richly woven 14th-century medieval tapestry. Knights and mythical beasts flank a massive scroll. The exact text woven into the scroll reads: 'DOG HAUS', 'LITTLE DRUNK', 'NETFLIX', 'ORAL EXAM', 'SLEEP', 'MORNING PICK ME UP', 'COFFEE', 'OFF TO WORK'. STYLE: Renaissance woven tapestry, intricate border filigree, ornate illuminated manuscript Gothic script, rich jewel tones like crimson and royal blue. MOOD: Mythical, historic, grandiose, legendary. LIGHTING: Soft, ambient museum gallery lighting reflecting off gold thread. CAMERA: Macro photography of woven textile, visible thread grain, rich tactile texture."
    },
    {
        "name": "grok_v5_receipt.png",
        "prompt": "SCENE: A crinkled, giant 1970s diner cash register receipt unspooling across the frame. The itemized charges feature the exact text: 'DOG HAUS', 'LITTLE DRUNK', 'NETFLIX', 'ORAL EXAM', 'SLEEP', 'MORNING PICK ME UP', 'COFFEE', 'OFF TO WORK'. A coffee stain rings the corner. STYLE: Retro thermal paper printout, monospaced typewriter font, faded purple ink, hyper-realistic macro photography. MOOD: Mundane, nostalgic, ironic, everyday transaction turned epic. LIGHTING: Harsh diner fluorescent overhead light, casting a sharp shadow from the curled paper. CAMERA: Shot on Canon EOS R5 with 100mm macro lens, razor-sharp focus on the text, shallow depth of field on the edges."
    }
]

for p in prompts:
    print(f"Generating {p['name']}...")
    cmd = [
        "omni-image",
        "generate",
        p["prompt"],
        "--model", "grok-imagine-image-quality",
        "--size", "1024x1536",
        "-o", f"/home/matthias/github/viajes-matthiasgoodman-com/public/images/posters/{p['name']}"
    ]
    subprocess.run(cmd)

print("Done generating new Grok posters.")
