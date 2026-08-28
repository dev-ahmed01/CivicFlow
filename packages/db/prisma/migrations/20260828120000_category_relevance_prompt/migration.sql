ALTER TABLE "Category" ADD COLUMN "relevancePrompt" TEXT;

UPDATE "Category"
SET "relevancePrompt" = CASE "name"
  WHEN 'Road Damage' THEN 'a pothole, damaged road, cracked pavement, or broken asphalt'
  WHEN 'Streetlight' THEN 'a damaged, broken, leaning, or non-working street light'
  WHEN 'Water Supply' THEN 'water leakage, a broken water pipe, flooding, or standing water'
  WHEN 'Drainage/Sewage' THEN 'an overflowing drain, blocked storm drain, open sewer, or sewage spill'
  WHEN 'Garbage/Waste' THEN 'dumped garbage, litter, an overflowing trash bin, or solid waste'
  WHEN 'Electrical Hazard' THEN 'exposed electrical wires, a fallen power line, sparking equipment, or an electrical hazard'
  WHEN 'Public Toilet' THEN 'a damaged, dirty, blocked, or unusable public toilet'
  WHEN 'Parks & Trees' THEN 'a fallen or hazardous tree, damaged park equipment, or neglected public park'
  WHEN 'Stray Animals' THEN 'stray dogs, cattle, or other unattended animals in a public place'
  WHEN 'Illegal Construction' THEN 'unauthorized construction, building work obstructing a public area, or construction debris'
  WHEN 'Traffic & Signage' THEN 'a damaged traffic sign, broken signal, missing road sign, or traffic obstruction'
  ELSE 'a visible ' || "name" || ' civic issue in a public place'
END;

ALTER TABLE "Category" ALTER COLUMN "relevancePrompt" SET NOT NULL;
