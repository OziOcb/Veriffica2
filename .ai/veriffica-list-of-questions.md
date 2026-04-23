# Used Car Checklist / Lista kontrolna używanego samochodu

## Part 1 — Info about the car
Forma do wypełnienia w której użytkownik wpisywać będzie podstawowe dane pojazdu
- Price
- Make (required, part of the title)
- Model (required, part of the title)
- Year of production (part of the title)
- Registration number (part of the title)
- VIN number
- Mileage
- Fuel type: (dropdown, required, affects the questions)
    - Petrol
    - Diesel
    - LPG
    - Hybrid
    - Electric
- Transmission: (dropdown, required, affects the questions)
    - Manual
    - Automatic
- Drive: (dropdown, required, affects the questions)
    - 2WD
    - 4WD
- Color
- Body type: (dropdown, required, affects the questions)
    - Sedan
    - Hatchback
    - SUV
    - Coupe
    - Convertible
    - Van
    - Pickup
    - Other
- No of doors
- Address
- Notes

## Question mapping logic / Logika mapowania pytań

The list below defines which questions must be shown after the user completes Part 1.

### 1. Core rules
- All users always see the base questions from:
  - Part 2: Car Body, Front suspension, Tires, Car interior
  - Part 5: Chassis numbers (VIN), Service booklet, Registration certificate, Vehicle card, Cars imported from the EU
- Questions marked `If equipped` are shown only when that equipment is visibly present in the inspected car.
- If the user changes any required field in Part 1 after answering questions, the app should:
  - keep answers that still match the new configuration
  - remove answers that no longer match the new configuration
  - recalculate per-Part progress and Total Score immediately

### 2. Fuel type mapping

#### Petrol
- Show all base combustion-engine questions from Parts 2-4.
- Show `Spark plugs condition`.
- Show `Black exhaust from gasoline engine`.
- Hide diesel-only, LPG-only and electric-only sections.

#### Diesel
- Show all base combustion-engine questions from Parts 2-4 except petrol-only checks.
- Show the diesel-only sections listed below.
- Hide `Spark plugs condition`.
- Hide `Black exhaust from gasoline engine`.
- Hide LPG-only and electric-only sections.

#### LPG
- Show all petrol questions.
- Show all LPG sections in Part 2 and Part 5.
- Hide diesel-only and electric-only sections.

#### Hybrid
- Show all base questions for body, suspension, tires, interior, VIN and documents.
- Show combustion-engine sections that are still applicable to the inspected hybrid car.
- Show hybrid/high-voltage sections.
- Hide LPG-only sections unless the car is visibly equipped with LPG.
- Hide pure electric-only checks that require a car with no combustion engine.

#### Electric
- Show all base questions for body, suspension, tires, interior, VIN and documents.
- Hide combustion-engine sections that depend on engine oil, exhaust, spark plugs, clutch or fuel combustion.
- Show electric/high-voltage/charging sections.
- Hide LPG-only and diesel-only sections.

### 3. Transmission mapping

#### Manual
- Show `Gearbox and clutch` checks for clutch engagement and starting in third gear.
- Show any question that refers to the clutch pedal or manual gear lever behavior.
- Hide automatic-only gearbox questions.

#### Automatic
- Hide `The car starts in third gear`.
- Hide clutch-specific questions.
- Show all automatic-only gearbox questions listed below.

### 4. Drive mapping

#### 2WD
- Show all base suspension, steering and braking questions.
- Hide 4WD-only drivetrain questions.

#### 4WD
- Show all base suspension, steering and braking questions.
- Show 4WD drivetrain questions listed below.

### 5. Body type mapping

#### Sedan / Hatchback / Coupe / Other
- Show the base checklist only.

#### SUV
- Show the base checklist.
- Show `SUV / raised body checks`.

#### Convertible
- Show the base checklist.
- Show `Convertible roof and seals`.

#### Van
- Show the base checklist.
- Show `Van body and cargo area`.

#### Pickup
- Show the base checklist.
- Show `Pickup load bed and tailgate`.

### 6. Mapping matrix by section

#### Part 2 — At a standstill
- Always show:
  - Car Body
  - Front suspension
  - Tires
  - Car interior
- Show only for Petrol / LPG / Hybrid when combustion engine is present:
  - The condition of the coolant in the expansion tank and engine
  - Oil condition
  - Spark plugs condition
  - Belts and pulleys
- Show only for Diesel / Hybrid when diesel engine is present:
  - Diesel fuel system
  - Diesel cold-engine checks
- Show only for LPG:
  - LPG installation
- Show only for Electric / Hybrid:
  - High-voltage battery and electrical system
  - Charging port and charging accessories (if equipped)
- Show only for Automatic:
  - Automatic transmission visual inspection
- Show only for 4WD:
  - 4WD driveline condition
- Show only for Convertible:
  - Convertible roof and seals
- Show only for SUV:
  - SUV / raised body checks
- Show only for Van:
  - Van body and cargo area
- Show only for Pickup:
  - Pickup load bed and tailgate
- Hide for Electric:
  - Exhaust system condition
  - Mechanical turbocharger

#### Part 3 — Starting the engine
- Show only for combustion vehicles and hybrids with combustion engine:
  - Ignition
  - Engine condition
  - Exhaust system
- Show only for Diesel:
  - Diesel start-up behavior
- Show only for Electric / Hybrid:
  - Hybrid / electric power-up checks
- Show only for Automatic:
  - Automatic selector engagement at standstill
- Hide for Electric:
  - Exhaust system
  - Engine oil splash / smoke checks

#### Part 4 — Test drive
- Always show:
  - Suspension
  - Steering system
  - Other phenomena
  - Brakes
- Show only for Manual:
  - Manual gearbox and clutch condition
- Show only for Automatic:
  - Automatic transmission operation
- Show only for Diesel:
  - Diesel operation under load
- Show only for Electric / Hybrid:
  - Hybrid / electric drive behavior
- Show only for 4WD:
  - 4WD system operation
- Show only for turbo-equipped combustion vehicles:
  - Turbocharger
- Show only for Convertible:
  - Convertible body noise and seal behavior

#### Part 5 — Documents
- Always show:
  - Chassis numbers (VIN)
  - Service booklet
  - Registration certificate
  - Vehicle card
  - Cars imported from the EU
- Show only for LPG:
  - LPG documents
- Show only for Electric / Hybrid if equipped:
  - Charging and traction battery documents

---

## Part 2 — At a standstill / Na postoju

### Car Body
- Corrosion, blistering
  - Bonnet
  - Boot lid
  - Fender
  - Gasket and window areas
  - Body dents
  - Fuel filler area
  - Hinges connections
  - Door edges
  - Handles
  - Engine compartment
  - Floor (moisture)
  - Windshield
  - Floor, under back seats
- traces of repairs / use
  - Paint discoloration
  - Paint cracking
  - Paint swelling
  - Visible lumps and dirt under the paint
  - Traces of paint/polishing paste on the seals
  - Badly matched body parts
  - Moldings curves or uneven body lines
  - Noticeable welds on the car body, bumpers etc.
  - Different production dates, different glass manufacturers
  - Different production dates, different lamp manufacturers
  - Scratches on the windshield under the wipers
  - Damages on the windshields (chips, cracks)

### Engine compartment and engine
- Bumpers and fenders
  - Damaged mounting bolts (paint scratches on the bolt head)
  - Different fastening elements
- Side members
  - Rust
  - Traces of repairs
- Welds
  - Asymmetrical welds

#### The condition of the coolant in the expansion tank and engine
- Lack of clarity *1
- Smell of exhaust fumes *1
- Black or brown grease on the edges of the tank *1
- Foaming *1
- Leaks *2

#### Oil condition
- Leakage around the oil filler wrench *3
- Leaks around the engine block *3
- Leaks around the motor head *3
- Leaks around the oil drain *3
- Leaks around the oil pump *3
- Leaks around the oil filter *3
- Leaks around the turbocharger (if applicable) *3
- Water marks on the oil dipstick *1
- Sludge on the oil plug *1
- Metal filings on the oil indicator *4

#### Spark plugs condition
- Black coating
- Traces of soot

#### Diesel fuel system (If Diesel)
- Diesel fuel filter housing leaks *37
- Traces of metal filings around the high-pressure pump *38
- Wet injectors or smell of diesel fuel in the engine bay *39
- Cracked or hardened return fuel hoses *39

#### Diesel cold-engine checks (If Diesel)
- Glow plug indicator does not behave normally after turning the ignition on *40
- Excessive waxy deposits around the fuel filter in cold weather *41

#### LPG installation (If equipped)
- Corrosion of the fuel pump
- Corrosion of the fuel tank
- Dirty fuel filter

#### High-voltage battery and electrical system (If Electric / Hybrid)
- Damaged orange high-voltage cables or missing protective covers *42
- Warning labels missing in the engine bay or service access areas
- Traces of impact, dents or deformation near the traction battery housing *43
- Evidence of moisture, corrosion or dirt around high-voltage connectors *42
- Strong chemical smell near the battery area after opening the car *43

#### Charging port and charging accessories (If Electric / Hybrid and if equipped)
- Charging port flap damaged or does not close properly
- Visible corrosion, burns or bent pins in the charging port *44
- Charging cable insulation damaged or plug casing cracked *44
- Portable charger missing or obviously damaged (if included in the sale)

#### Belts and pulleys
- Frayed belts
- Cracked belts
- Deflected belts (about 1 cm or less)
- Deformation of pulleys

#### Mechanical turbocharger (if equipped)
- Broken compressor belt *5

#### Automatic transmission visual inspection (If Automatic)
- Transmission fluid leak under the gearbox area *45
- Burnt smell around the transmission fluid dipstick or filler area (if accessible) *45
- Selector positions on the lever are worn or not clearly engaging *46

#### 4WD driveline condition (If 4WD)
- Leaks around transfer case or rear differential *47
- Torn driveshaft or axle rubber boots *48
- Noticeable play in the prop shaft when checked by hand *47

#### Convertible roof and seals (If Convertible)
- Roof fabric or panels damaged, cracked or torn
- Moisture marks near roof seals or top edge of windshield *10
- Roof opens or closes unevenly (if test is possible) *49
- Side windows do not align with roof seals *49

#### SUV / raised body checks (If SUV)
- Cracked or damaged plastic underbody covers
- Damaged side steps or rocker area from off-road impacts
- Uneven wear or damage on lower bumpers and splash shields

#### Van body and cargo area (If Van)
- Sliding door rollers noisy, sticking or misaligned *50
- Rear cargo floor bent, cracked or patched
- Signs of water leaks in the cargo area *10
- Bulkhead or cargo tie-down points visibly damaged

#### Pickup load bed and tailgate (If Pickup)
- Load bed floor heavily bent or patched
- Tailgate cables, hinges or latches damaged *51
- Corrosion under bed liner or around wheel arches
- Bed and cabin alignment visibly uneven *52

### Front suspension
#### Suspension condition
- signs of corrosion of the suspension
- cracked rubber parts *6
- Slow return to vertical when force is applied over the shock absorber *7

### Tires
#### Tires condition
- Wear less than 1.6mm or TW1 point
- Uneven tire wear *8
- Bubbles, cracks, scratches, etc.

### Exhaust system
#### Exhaust system condition
- Traces of corrosion

### Car interior
#### Wear indicating high mileage
- Heavily worn driver's seat upholstery
- Sagging driver seat
- Broken driver's seat springs
- Visible wipe of the driver's seat from the door side
- Both sets of keys worn out
- Driver's belt tensioner springs are weak
- Worn steering wheel
- Steering wheel in better condition than the interior of the car *9
- Worn marks on light switches
- Worn pedal covers or new pedal covers *9
- Worn or noticeably new stick shift *9
- Shifter guard cracked
- Cracked shifters sound deadening

#### The condition of the upholstery
- Water marks *10
- Moisture *10
- Musty smell *10
- Burnt upholstery *11
- Dirty ashtray *11

#### The electrics
- Interior and exterior lighting is not working
- Air vents are not working
- Central locking not working (if applicable)
- Electric mirrors not working (if applicable)
- Radio not working (if applicable)
- Electric windows not working (if applicable)
- Sunroof not working (if applicable)

#### Steering system
- Backlash when turning the steering wheel
- a knock while pulling and pushing the steering wheel diagonally from right to left *12
- a knock coming from the bottom of the car when shaking the steering wheel rapidly left and right *12

---

## Part 3 — Starting the engine / Uruchamianie silnika

### Ignition
#### Engine start-up
- Before starting the engine, the indicator lamps are off when the key is turned
- The engine starts more than 3 s after turning the key *13
- Rasp and metal noises when turning the key *14
- No start-up after turning the key *15
- indicator lamps on after starting the engine *16
- Rough idling *17

#### Diesel start-up behavior (If Diesel)
- Excessive smoke immediately after cold start *53
- Engine shakes strongly for the first seconds after starting *54
- Glow plug or engine management warning remains on after start *40

#### Hybrid / electric power-up checks (If Hybrid / Electric)
- The car does not enter READY / drive-ready mode after start procedure *55
- High-voltage system warning light remains on after power-up *42
- Main display shows charging system, battery or isolation fault messages *42
- Unusually loud cooling fan starts immediately after power-up on a cold car *43

### Car interior
#### Steering system
- A whistling sound is heard when the wheels turn fully *18
- Vibration of plastic parts in the cabin *19

#### Automatic selector engagement at standstill (If Automatic)
- Delay or strong jerk when shifting from P to D or R with the brake applied *46
- Selector cannot be moved smoothly through all positions *46

### Engine compartment and engine
#### Engine condition
- After removing the oil plug and/or dipstick, visible oil splashes and smoke from the engine *4

### Exhaust system
- Smoke in the engine compartment or a strong smell of exhaust gases *20
- Oily and black deposits on the tip of the exhaust pipe *21
- Blue exhaust *4
- White exhaust *1
- Black exhaust from gasoline engine (not applicable to diesel engines) *22

---

## Part 4 — Test drive / Jazda próbna

### Gearbox and clutch
#### Gearbox and clutch condition
- The car starts in third gear *23
- Clutch catches low or high
- Gear stick shakes *24
- Imprecise gears *24
- Hearable creaks *24

#### Automatic transmission operation (If Automatic)
- Delay when moving off after selecting D or R *46
- Noticeable jerks during upshifts or downshifts *46
- Gear hunting or frequent unnecessary shifts at steady speed *46
- Transmission slips under acceleration (engine revs rise but speed does not) *45

#### Diesel operation under load (If Diesel)
- Noticeable loss of power above medium speed *56
- Excessive black smoke under acceleration *22
- DPF / emissions warning appears during the drive *56

### Suspension
#### Suspension responses
- Rear suspension knocks *25
- Swaying on bumps *26
- Lack of traction after braking *27

### Steering system
#### Steering system responses
- Drift after releasing the steering wheel *26
- Loss of traction on the turns *27

### Other phenomena
- Whining as speed increases *28

#### Hybrid / electric drive behavior (If Hybrid / Electric)
- Jerky transition between regenerative braking and friction braking *57
- Noticeable vibration or humming from the battery area during acceleration *43
- Sudden drop of available power shown on the dashboard *55
- State-of-charge drops unusually fast during a short drive *58

### Brakes
#### Braking system responses
- Excessive brake pedal travel *29
- Brake not responding *30
- Brake heating *31
- Steering wheel and brake pedal tremble when braking *32
- Springing and deep pressure on the brake pedal *33
- Wheel lock when braking with ABS (If equipped) *34
- Drift when braking *35

### Turbocharger (If equipped)
#### Exhaust turbocharger
- Increased oil consumption and emissions from the exhaust system *36
- Loud operation and metallic sound *36
- Turbocharger only turns on above a certain speed *36

#### Mechanical turbocharger
- Compressor whistling excessively loud as engine speed increases *36

### 4WD system operation (If 4WD)
#### Drivetrain responses
- Binding, hopping or heavy resistance during slow full-lock turns on dry ground *59
- Knocking or vibration from the center tunnel during acceleration *47
- 4WD warning light appears during the drive *59

### Convertible body noise and seal behavior (If Convertible)
#### Roof responses during the drive
- Excessive wind noise around the roof seals at city speed *49
- Water leak noise, rattles or roof frame knocks on bumps *49

---

## Part 5 — Documents / Numer nadwozia i dokumenty pojazdu

### Chassis numbers (VIN)
#### VIN number compliance
- The car has decryptable VINs
- The VIN is 17 characters long
- VIN numbers on the rating plate are consistent with those stamped on the wheel arch or in the trunk
- After identification, the VIN data matches the version, equipment, car type, etc.

### LPG (If equipped)
#### Necessary documents
- Gas installation documentation
- Gas cylinder approval
- LPG entry in the registration certificate

### Charging and traction battery documents (If Electric / Hybrid and if equipped)
#### Necessary documents
- Battery warranty or battery health report (if available from the seller)
- Charging cable(s) and charging adapter(s) included in the sale
- Documentation for replaced traction battery modules (if applicable)
- Documentation for high-voltage system service campaigns or recalls (if applicable)

### Service booklet
#### Desired information
- Bills and invoices for all repairs
- Mileage in the booklet matches the odometer reading
- Information on servicing the car at an authorized service station throughout its lifetime

### Registration certificate
#### Compliance of the data in the documents with the actual data
- Details of the owner and/or co-owner
- Car data (chassis number, engine number etc.)
- Information about the gas system and/or tow bar (If equipped)

### Vehicle card
#### Content
- Confirmation of the car's history

### Cars imported from the EU
#### Documents compulsory for the seller
- Sale and purchase agreement
- Vehicle card
- Confirmation of the deregistration of the car abroad

#### Documents non-compulsory for the seller
- Certificate of a positive result of the technical examination
- Confirmation of excise duty payment
- Confirmation of VAT payment
- Confirmation of recycling fee payment
- Translations of the documents in a foreign language

---

## EXPLANATIONS / WYJAŚNIENIA
1. Damaged cylinder head, cylinder head gasket or engine block
2. Coolant leakage due to damaged rubber hoses, radiator, water pump, cylinder head or engine block
3. Leaking seals, need to be replaced
4. Worn drive unit
5. Turbocharger for replacement
6. Replacement needed
7. Damaged shock absorber
8. Bad chassis geometry or bad wheel alignment
9. Indicates a replacement of a worn element due to damage or hide the signs of wear
10. Car leaking or flooded
11. The owner was a smoker
12. Steering system requires repair
13. Damaged / discharged battery or damaged alternator
14. Damaged starter
15. Starter, alternator or battery damaged
16. Systems indicated by the check lights damaged
17. Damage to the lambda probe
18. Worn power steering belts or pulleys
19. Damaged engine cushions
20. Leaking at the front of the exhaust system
21. Too much oil in the combustion chamber - damaged seals, valves or rings
22. Fuel system not adjusted - carburetor or fuel injectors
23. Worn clutch disc or poor contact pressure
24. Gearbox damaged
25. Bad stabilizer link or damaged rocker arm, rubber bushing, or rocker arm pin
26. Damaged control arm or tie rod
27. Worn shock absorbers, damaged steering rods or suspension springs
28. Defective bearings or wrong tires
29. Brake fluid leakage
30. Braking system badly damaged
31. Seized brakes
32. Broken brake discs or drums, poorly fitting rims or worn bearings
33. Air in the brake system
34. ABS system damaged
35. Bad brake linings or discs or damaged steering system components
36. Damaged turbocharger
37. Fuel filter housing or seals leaking
38. High-pressure fuel pump may be wearing internally
39. Fuel system leakage, requires repair
40. Glow plug system or engine management fault
41. Fuel contamination or poor diesel maintenance
42. High-voltage electrical system requires specialist inspection
43. Traction battery housing or battery cooling system may be damaged
44. Charging system requires repair and may be unsafe to use
45. Automatic transmission wear or fluid condition issue
46. Automatic selector or gearbox control issue
47. Transfer case, differential or prop shaft wear
48. Driveshaft joint or axle boot replacement needed
49. Convertible roof mechanism or sealing requires repair
50. Sliding door mechanism worn or misaligned
51. Tailgate hardware damaged and may fail under load
52. Pickup body may have structural or accident-related damage
53. Combustion quality, glow plugs or injector system issue
54. Engine mount, injector or compression issue
55. Hybrid / EV drive system fault, specialist diagnosis required
56. Diesel emissions or turbo / intake issue
57. Brake blending or regenerative braking calibration issue
58. Traction battery condition may be degraded
59. 4WD / AWD system fault or drivetrain wind-up issue

---

## Instrukcja (Instruction)
The used car checklist is designed to help people without experience in buying a good used car.
Thanks to the list, you can check all the most important elements of the vehicle before making a decision to buy it.
This list is only an auxiliary tool which does not guarantee that the vehicle you are buying is in a good technical condition, but still it's a good starting point to assess the technical condition of the car and save us from spending money in a service station.

The check list consists of two sections:

- Section 1 (Parts 1-4) - vehicle condition assessment.
- Section 2 (Part 5) - Chassis numbers and vehicle documents.

"Section 1" is to help in assessing the overall condition of the car, "Section 2" is to indicate which documents should be taken into account when buying a car.

In "Section 1" all the elements and reactions of the car are listed one by one, according to the order attention should be paid during the inspection.

Below the name of the element there are "Yes", "No" and "I can't check" buttons, which should be properly selected after evaluating the car element.

- The "Yes" button means "Yes, it occurs" and should be selected if the condition, element or reaction described above is present.
- The "No" button means "No, it doesn't occur" and should be selected if the above-described state, element or reaction is not present.

Choosing specific answers will allow you to assess the condition of the car you are buying.

Example:
If, during the inspection, we notice that the car has moldings and body curves, then in the "Body" category, in the "Repair / wear traces" button, in the "Molding curves and body lines" sub-item, select the "Yes" button

If in "Section 1" we answer "Yes" to more questions, then we are dealing with a technically inferior model of the car.

If in "Section 2" we answer "Yes" to more questions, then we are dealing with better sellers and a more reliable car.

Most of the questions have an 'i' button and a short description of the fault will appear.

I wish you a successful inspection of the cars
