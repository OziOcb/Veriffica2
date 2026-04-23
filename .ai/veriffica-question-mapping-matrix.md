# Veriffica Question Mapping Matrix

This document converts the rules from `veriffica-list-of-questions.md` into an implementation-ready matrix for frontend and backend.

## 1. Purpose

Use this file as the operational source for:
- deciding which question groups are visible after Part 1 is completed
- recalculating visibility when Part 1 data changes
- pruning answers that no longer match the selected configuration
- defining stable IDs for question groups and visibility rules

## 2. Input fields from Part 1

| Field ID | Part 1 field | Type | Required | Allowed values | Notes |
| --- | --- | --- | --- | --- | --- |
| `make` | Make | text | Yes | free text | Used in session title |
| `model` | Model | text | Yes | free text | Used in session title |
| `year` | Year of production | number | Yes | strict validation | Used in session title |
| `registrationNumber` | Registration number | text | Yes | strict validation | Used in session title |
| `vin` | VIN number | text | No | strict validation when present | Used in Part 5 checks |
| `mileage` | Mileage | number | No | strict validation when present | Optional |
| `fuelType` | Fuel type | enum | Yes | `petrol`, `diesel`, `lpg`, `hybrid`, `electric` | Primary mapping field |
| `transmission` | Transmission | enum | Yes | `manual`, `automatic` | Primary mapping field |
| `drive` | Drive | enum | Yes | `2wd`, `4wd` | Primary mapping field |
| `bodyType` | Body type | enum | Yes | `sedan`, `hatchback`, `suv`, `coupe`, `convertible`, `van`, `pickup`, `other` | Primary mapping field |
| `color` | Color | text | No | free text | Optional |
| `doorCount` | No of doors | number | No | strict validation when present | Optional |
| `address` | Address | text | No | free text | Optional |
| `notes` | Notes | text | No | free text | Separate from inspection notes |

## 3. Visibility rule semantics

| Value | Meaning |
| --- | --- |
| `Always` | Always visible after required Part 1 fields are completed |
| `Show` | Visible only when the listed condition is true |
| `Hide` | Hidden when the listed condition is true |
| `If equipped` | Visible only when configuration allows it and the user confirms the equipment exists |
| `N/A` | Not controlled by this dimension |

## 4. Question group catalog

| Group ID | Part | Section / group | Base type |
| --- | --- | --- | --- |
| `p2_car_body` | Part 2 | Car Body | Base |
| `p2_engine_bay_base` | Part 2 | Engine compartment and engine: Bumpers, side members, welds | Base |
| `p2_coolant_condition` | Part 2 | The condition of the coolant in the expansion tank and engine | Conditional |
| `p2_oil_condition` | Part 2 | Oil condition | Conditional |
| `p2_spark_plugs` | Part 2 | Spark plugs condition | Conditional |
| `p2_diesel_fuel_system` | Part 2 | Diesel fuel system | Conditional |
| `p2_diesel_cold_checks` | Part 2 | Diesel cold-engine checks | Conditional |
| `p2_lpg_installation` | Part 2 | LPG installation | Conditional |
| `p2_hv_system` | Part 2 | High-voltage battery and electrical system | Conditional |
| `p2_charging_port` | Part 2 | Charging port and charging accessories | Conditional |
| `p2_belts_pulleys` | Part 2 | Belts and pulleys | Conditional |
| `p2_mechanical_supercharger` | Part 2 | Mechanical turbocharger | Conditional |
| `p2_auto_visual` | Part 2 | Automatic transmission visual inspection | Conditional |
| `p2_4wd_driveline` | Part 2 | 4WD driveline condition | Conditional |
| `p2_convertible_roof` | Part 2 | Convertible roof and seals | Conditional |
| `p2_suv_checks` | Part 2 | SUV / raised body checks | Conditional |
| `p2_van_cargo` | Part 2 | Van body and cargo area | Conditional |
| `p2_pickup_bed` | Part 2 | Pickup load bed and tailgate | Conditional |
| `p2_front_suspension` | Part 2 | Front suspension | Base |
| `p2_tires` | Part 2 | Tires | Base |
| `p2_exhaust_condition` | Part 2 | Exhaust system condition | Conditional |
| `p2_interior_wear` | Part 2 | Car interior: wear indicating high mileage | Base |
| `p2_interior_upholstery` | Part 2 | Car interior: upholstery condition | Base |
| `p2_interior_electrics` | Part 2 | Car interior: electrics | Base |
| `p2_steering_static` | Part 2 | Car interior: steering system | Base |
| `p3_ignition` | Part 3 | Ignition / engine start-up | Conditional |
| `p3_diesel_start` | Part 3 | Diesel start-up behavior | Conditional |
| `p3_ev_ready` | Part 3 | Hybrid / electric power-up checks | Conditional |
| `p3_steering_interior` | Part 3 | Car interior: steering system | Base |
| `p3_auto_selector` | Part 3 | Automatic selector engagement at standstill | Conditional |
| `p3_engine_condition` | Part 3 | Engine compartment and engine: engine condition | Conditional |
| `p3_exhaust` | Part 3 | Exhaust system | Conditional |
| `p4_manual_gearbox` | Part 4 | Gearbox and clutch condition | Conditional |
| `p4_automatic_gearbox` | Part 4 | Automatic transmission operation | Conditional |
| `p4_diesel_load` | Part 4 | Diesel operation under load | Conditional |
| `p4_suspension` | Part 4 | Suspension responses | Base |
| `p4_steering` | Part 4 | Steering system responses | Base |
| `p4_other` | Part 4 | Other phenomena | Base |
| `p4_ev_drive` | Part 4 | Hybrid / electric drive behavior | Conditional |
| `p4_brakes` | Part 4 | Braking system responses | Base |
| `p4_turbo` | Part 4 | Turbocharger | Conditional |
| `p4_4wd_operation` | Part 4 | 4WD system operation | Conditional |
| `p4_convertible_noise` | Part 4 | Convertible body noise and seal behavior | Conditional |
| `p5_vin` | Part 5 | Chassis numbers (VIN) | Base |
| `p5_lpg_docs` | Part 5 | LPG documents | Conditional |
| `p5_ev_docs` | Part 5 | Charging and traction battery documents | Conditional |
| `p5_service_booklet` | Part 5 | Service booklet | Base |
| `p5_registration` | Part 5 | Registration certificate | Base |
| `p5_vehicle_card` | Part 5 | Vehicle card | Base |
| `p5_eu_import` | Part 5 | Cars imported from the EU | Base |

## 5. Matrix by fuel type

| Group ID | Petrol | Diesel | LPG | Hybrid | Electric |
| --- | --- | --- | --- | --- | --- |
| `p2_car_body` | Always | Always | Always | Always | Always |
| `p2_engine_bay_base` | Always | Always | Always | Always | Always |
| `p2_coolant_condition` | Show | Show | Show | Show if combustion engine present | Hide |
| `p2_oil_condition` | Show | Show | Show | Show if combustion engine present | Hide |
| `p2_spark_plugs` | Show | Hide | Show | Show if spark plugs are present | Hide |
| `p2_diesel_fuel_system` | Hide | Show | Hide | Show if hybrid uses diesel engine | Hide |
| `p2_diesel_cold_checks` | Hide | Show | Hide | Show if hybrid uses diesel engine | Hide |
| `p2_lpg_installation` | Hide | Hide | Show | Hide unless hybrid has LPG retrofit | Hide |
| `p2_hv_system` | Hide | Hide | Hide | Show | Show |
| `p2_charging_port` | Hide | Hide | Hide | Show if equipped | Show if equipped |
| `p2_belts_pulleys` | Show | Show | Show | Show if combustion engine present | Hide |
| `p2_mechanical_supercharger` | Show if equipped | Show if equipped | Show if equipped | Show if equipped on combustion engine | Hide |
| `p2_auto_visual` | N/A | N/A | N/A | N/A | N/A |
| `p2_4wd_driveline` | N/A | N/A | N/A | N/A | N/A |
| `p2_convertible_roof` | N/A | N/A | N/A | N/A | N/A |
| `p2_suv_checks` | N/A | N/A | N/A | N/A | N/A |
| `p2_van_cargo` | N/A | N/A | N/A | N/A | N/A |
| `p2_pickup_bed` | N/A | N/A | N/A | N/A | N/A |
| `p2_front_suspension` | Always | Always | Always | Always | Always |
| `p2_tires` | Always | Always | Always | Always | Always |
| `p2_exhaust_condition` | Show | Show | Show | Show if combustion engine present | Hide |
| `p2_interior_wear` | Always | Always | Always | Always | Always |
| `p2_interior_upholstery` | Always | Always | Always | Always | Always |
| `p2_interior_electrics` | Always | Always | Always | Always | Always |
| `p2_steering_static` | Always | Always | Always | Always | Always |
| `p3_ignition` | Show | Show | Show | Show if combustion engine present | Hide |
| `p3_diesel_start` | Hide | Show | Hide | Show if hybrid uses diesel engine | Hide |
| `p3_ev_ready` | Hide | Hide | Hide | Show | Show |
| `p3_steering_interior` | Always | Always | Always | Always | Always |
| `p3_auto_selector` | N/A | N/A | N/A | N/A | N/A |
| `p3_engine_condition` | Show | Show | Show | Show if combustion engine present | Hide |
| `p3_exhaust` | Show | Show | Show | Show if combustion engine present | Hide |
| `p4_manual_gearbox` | N/A | N/A | N/A | N/A | N/A |
| `p4_automatic_gearbox` | N/A | N/A | N/A | N/A | N/A |
| `p4_diesel_load` | Hide | Show | Hide | Show if hybrid uses diesel engine | Hide |
| `p4_suspension` | Always | Always | Always | Always | Always |
| `p4_steering` | Always | Always | Always | Always | Always |
| `p4_other` | Always | Always | Always | Always | Always |
| `p4_ev_drive` | Hide | Hide | Hide | Show | Show |
| `p4_brakes` | Always | Always | Always | Always | Always |
| `p4_turbo` | Show if equipped | Show if equipped | Show if equipped | Show if equipped on combustion engine | Hide |
| `p4_4wd_operation` | N/A | N/A | N/A | N/A | N/A |
| `p4_convertible_noise` | N/A | N/A | N/A | N/A | N/A |
| `p5_vin` | Always | Always | Always | Always | Always |
| `p5_lpg_docs` | Hide | Hide | Show | Hide unless hybrid has LPG retrofit | Hide |
| `p5_ev_docs` | Hide | Hide | Hide | Show if equipped | Show if equipped |
| `p5_service_booklet` | Always | Always | Always | Always | Always |
| `p5_registration` | Always | Always | Always | Always | Always |
| `p5_vehicle_card` | Always | Always | Always | Always | Always |
| `p5_eu_import` | Always | Always | Always | Always | Always |

## 6. Matrix by transmission

| Group ID | Manual | Automatic |
| --- | --- | --- |
| `p2_auto_visual` | Hide | Show |
| `p3_auto_selector` | Hide | Show |
| `p4_manual_gearbox` | Show | Hide |
| `p4_automatic_gearbox` | Hide | Show |

## 7. Matrix by drive

| Group ID | 2WD | 4WD |
| --- | --- | --- |
| `p2_4wd_driveline` | Hide | Show |
| `p4_4wd_operation` | Hide | Show |

## 8. Matrix by body type

| Group ID | Sedan | Hatchback | SUV | Coupe | Convertible | Van | Pickup | Other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `p2_convertible_roof` | Hide | Hide | Hide | Hide | Show | Hide | Hide | Hide |
| `p2_suv_checks` | Hide | Hide | Show | Hide | Hide | Hide | Hide | Hide |
| `p2_van_cargo` | Hide | Hide | Hide | Hide | Hide | Show | Hide | Hide |
| `p2_pickup_bed` | Hide | Hide | Hide | Hide | Hide | Hide | Show | Hide |
| `p4_convertible_noise` | Hide | Hide | Hide | Hide | Show | Hide | Hide | Hide |

## 9. Derived implementation rules

| Rule ID | Rule name | Condition | Result |
| --- | --- | --- | --- |
| `R1` | Part gate | Any required Part 1 field missing | Lock Parts 2-5 |
| `R2` | Session title | `make`, `model`, `year` or `registrationNumber` changes | Update session tile immediately |
| `R3` | Smart pruning | Any required mapping field changes after answers exist | Remove answers for groups that became hidden |
| `R4` | Recalculation | Visibility or answer set changes | Recalculate Part progress and Total Score immediately |
| `R5` | Equipment gate | Group marked `If equipped` | Show only after applicable configuration and equipment presence are both true |
| `R6` | EV hide rule | `fuelType = electric` | Hide all combustion-only oil, exhaust, spark plug, clutch and turbo groups |
| `R7` | Manual gate | `transmission = manual` | Show clutch/manual gearbox groups only |
| `R8` | Automatic gate | `transmission = automatic` | Show automatic selector and automatic gearbox groups only |
| `R9` | 4WD gate | `drive = 4wd` | Show 4WD driveline and 4WD dynamic groups |
| `R10` | Body gate | `bodyType` matches specialized body | Show body-specific groups only |

## 10. Answer pruning matrix

| Changed field | Remove answers from groups that no longer match | Keep answers from groups that remain visible |
| --- | --- | --- |
| `fuelType` | Fuel-specific groups from Parts 2-5 that are now hidden | Base groups and still-applicable conditional groups |
| `transmission` | `p2_auto_visual`, `p3_auto_selector`, `p4_manual_gearbox`, `p4_automatic_gearbox` as applicable | All unaffected groups |
| `drive` | `p2_4wd_driveline`, `p4_4wd_operation` when switching to `2wd` | All unaffected groups |
| `bodyType` | Convertible, SUV, Van, Pickup specific groups that no longer match | All unaffected groups |

## 11. Suggested backend structure

| Entity | Required fields |
| --- | --- |
| `inspection` | `id`, `userId`, `status`, `vehicleConfig`, `createdAt`, `updatedAt` |
| `vehicleConfig` | `make`, `model`, `year`, `registrationNumber`, `vin`, `mileage`, `fuelType`, `transmission`, `drive`, `bodyType`, `color`, `doorCount`, `address`, `notes` |
| `questionGroup` | `groupId`, `part`, `label`, `visibilityRules[]` |
| `question` | `id`, `groupId`, `label`, `explanationRef`, `requiresEquipmentFlag` |
| `answer` | `inspectionId`, `questionId`, `value`, `noteId?`, `updatedAt` |
| `inspectionNote` | `id`, `inspectionId`, `questionId?`, `questionLabel`, `content`, `createdAt`, `updatedAt` |

## 12. Suggested frontend evaluation order

| Step | Action |
| --- | --- |
| 1 | Validate required Part 1 fields |
| 2 | Unlock Parts 2-5 only when Part 1 is valid |
| 3 | Build visible question groups from fuel type matrix |
| 4 | Apply transmission overrides |
| 5 | Apply drive overrides |
| 6 | Apply body type overrides |
| 7 | Apply `If equipped` gates |
| 8 | Render only visible groups/questions |
| 9 | On Part 1 change, run pruning and recalculate progress + Total Score |

## 13. Notes for implementation

| Topic | Decision |
| --- | --- |
| Progress display | Use `current question / total questions in current Part` |
| Summary editing | Edit answers inline on the list, not through reopening cards |
| Notes | Each question card can append a note to one global inspection note document |
| Offline mode | Persist inspection, answers and notes locally and sync later |
| Scoring display | Show proportions of `Yes / No / Don't know`, never weighted scoring |