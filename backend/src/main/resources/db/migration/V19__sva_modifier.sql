-- V19: модификатор «Ветеран СВО и члены семьи погибших» — скидка 10%.
INSERT INTO price_modifiers (name, percent)
SELECT 'Ветеран СВО', -10.00
WHERE NOT EXISTS (SELECT 1 FROM price_modifiers WHERE name = 'Ветеран СВО');
