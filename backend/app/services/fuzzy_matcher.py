import re
from difflib import SequenceMatcher
from typing import Any

from app.schemas.ai import EntityType, MatchedEntity, ParseNaturalLanguageResponse


def normalize_text(text: str) -> str:
    """Normalize text by lowercasing and removing special punctuation."""
    cleaned = re.sub(r"[^\w\s-]", " ", text.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


STOP_WORDS = {"and", "or", "of", "for", "with", "in", "to", "a", "an", "the", "my", "some", "i", "want", "do"}


def calculate_similarity(candidate: str, target: str) -> float:
    """Calculate fuzzy similarity between a candidate text and a target entity name."""
    cand = normalize_text(candidate)
    tgt = normalize_text(target)

    if not cand or not tgt:
        return 0.0

    if cand == tgt:
        return 1.0

    cand_words = cand.split()
    tgt_words = tgt.split()

    # Avoid matching a multi-word phrase to a single-word target (e.g. "pres and" -> "pescado")
    if len(cand_words) > 1 and len(tgt_words) == 1:
        return 0.0

    # Substring inclusion bonuses
    if tgt in cand or cand in tgt:
        len_ratio = min(len(cand), len(tgt)) / max(len(cand), len(tgt))
        if len_ratio > 0.6:
            return max(0.85, len_ratio)

    # If single word comparison, require same starting letter or length proximity
    if len(cand_words) == 1 and len(tgt_words) == 1:
        if abs(len(cand) - len(tgt)) > 3:
            return 0.0
        return SequenceMatcher(None, cand, tgt).ratio()

    # Multi-word comparisons: direct and token sort ratio
    direct_ratio = SequenceMatcher(None, cand, tgt).ratio()
    cand_sorted = " ".join(sorted(cand_words))
    tgt_sorted = " ".join(sorted(tgt_words))
    token_ratio = SequenceMatcher(None, cand_sorted, tgt_sorted).ratio()

    return max(direct_ratio, token_ratio)



class CatalogItem:
    def __init__(
        self,
        item_id: str,
        name: str,
        category: EntityType,
        aliases: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ):
        self.id = item_id
        self.name = name
        self.category = category
        self.aliases = aliases or []
        self.metadata = metadata or {}

    @property
    def all_search_terms(self) -> list[str]:
        return [self.name] + self.aliases


class FuzzyEntityMatcher:
    """Matches natural language text against database entities with typo tolerance."""

    def __init__(self) -> None:
        self.catalog: list[CatalogItem] = self._build_default_catalog()

    def _build_default_catalog(self) -> list[CatalogItem]:
        items: list[CatalogItem] = [
            # Exercises
            CatalogItem(
                "ex_bench_press",
                "Barbell Bench Press",
                EntityType.EXERCISE,
                aliases=["bench press", "flat bench", "bench", "press banca", "chest press"],
                metadata={"primary_muscle": "chest", "equipment": "barbell"},
            ),
            CatalogItem(
                "ex_incline_dumbbell_press",
                "Incline Dumbbell Press",
                EntityType.EXERCISE,
                aliases=["incline dumbbell", "incline press", "incline dumbell", "press inclinado"],
                metadata={"primary_muscle": "upper chest", "equipment": "dumbbell"},
            ),
            CatalogItem(
                "ex_barbell_squat",
                "Barbell Squat",
                EntityType.EXERCISE,
                aliases=["squat", "squats", "back squat", "sentadilla", "sentadillas"],
                metadata={"primary_muscle": "quadriceps", "equipment": "barbell"},
            ),
            CatalogItem(
                "ex_romanian_deadlift",
                "Romanian Deadlift",
                EntityType.EXERCISE,
                aliases=["rdl", "romanian deadlifts", "peso muerto rumano", "stiff leg deadlift"],
                metadata={"primary_muscle": "hamstrings", "equipment": "barbell"},
            ),
            CatalogItem(
                "ex_deadlift",
                "Conventional Deadlift",
                EntityType.EXERCISE,
                aliases=["deadlift", "deadlifts", "peso muerto"],
                metadata={"primary_muscle": "posterior chain", "equipment": "barbell"},
            ),
            CatalogItem(
                "ex_overhead_press",
                "Overhead Press",
                EntityType.EXERCISE,
                aliases=["ohp", "military press", "shoulder press", "press militar"],
                metadata={"primary_muscle": "shoulders", "equipment": "barbell"},
            ),
            CatalogItem(
                "ex_pull_up",
                "Pull-Up",
                EntityType.EXERCISE,
                aliases=["pull up", "pullups", "chin up", "dominadas"],
                metadata={"primary_muscle": "lats", "equipment": "bodyweight"},
            ),
            CatalogItem(
                "ex_lat_pulldown",
                "Lat Pulldown",
                EntityType.EXERCISE,
                aliases=["pulldown", "lat pull down", "jalon al pecho", "cable pulldown"],
                metadata={"primary_muscle": "lats", "equipment": "cable"},
            ),
            CatalogItem(
                "ex_bicep_curl",
                "Bicep Curl",
                EntityType.EXERCISE,
                aliases=["curl", "biceps curl", "dumbbell curl", "curl de biceps"],
                metadata={"primary_muscle": "biceps", "equipment": "dumbbell"},
            ),
            CatalogItem(
                "ex_tricep_pushdown",
                "Tricep Pushdown",
                EntityType.EXERCISE,
                aliases=["triceps pushdown", "cable pushdown", "extension de triceps"],
                metadata={"primary_muscle": "triceps", "equipment": "cable"},
            ),
            CatalogItem(
                "ex_leg_press",
                "Leg Press",
                EntityType.EXERCISE,
                aliases=["machine leg press", "prensa de piernas", "prensa"],
                metadata={"primary_muscle": "quadriceps", "equipment": "machine"},
            ),
            # Routines
            CatalogItem(
                "routine_upper_body",
                "Upper Body",
                EntityType.ROUTINE,
                aliases=["upper", "torso", "upper body split", "rutina de torso"],
                metadata={"default_duration_minutes": 50},
            ),
            CatalogItem(
                "routine_lower_body",
                "Lower Body",
                EntityType.ROUTINE,
                aliases=["lower", "leg day", "pierna", "lower body split"],
                metadata={"default_duration_minutes": 50},
            ),
            CatalogItem(
                "routine_push",
                "Push Day",
                EntityType.ROUTINE,
                aliases=["push", "dia de empuje", "push workout"],
                metadata={"default_duration_minutes": 45},
            ),
            CatalogItem(
                "routine_pull",
                "Pull Day",
                EntityType.ROUTINE,
                aliases=["pull", "dia de traccion", "pull workout"],
                metadata={"default_duration_minutes": 45},
            ),
            CatalogItem(
                "routine_legs",
                "Leg Day",
                EntityType.ROUTINE,
                aliases=["legs", "dia de pierna", "leg workout"],
                metadata={"default_duration_minutes": 55},
            ),
            CatalogItem(
                "routine_full_body",
                "Full Body",
                EntityType.ROUTINE,
                aliases=["fullbody", "cuerpo completo", "full body workout"],
                metadata={"default_duration_minutes": 60},
            ),
            # Foods
            CatalogItem(
                "food_chicken_breast",
                "Chicken Breast",
                EntityType.FOOD,
                aliases=["chicken", "chiken", "grilled chicken", "pechuga de pollo", "pollo"],
                metadata={"calories_per_100g": 165, "protein": 31, "carbs": 0, "fat": 3.6},
            ),
            CatalogItem(
                "food_brown_rice",
                "Brown Rice",
                EntityType.FOOD,
                aliases=["rice", "arroz", "arroz integral", "white rice"],
                metadata={"calories_per_100g": 120, "protein": 2.6, "carbs": 25, "fat": 1.0},
            ),
            CatalogItem(
                "food_salmon",
                "Salmon Fillet",
                EntityType.FOOD,
                aliases=["salmon", "grilled salmon", "fish", "pescado"],
                metadata={"calories_per_100g": 208, "protein": 20, "carbs": 0, "fat": 13},
            ),
            CatalogItem(
                "food_eggs",
                "Whole Eggs",
                EntityType.FOOD,
                aliases=["egg", "eggs", "boiled eggs", "huevo", "huevos"],
                metadata={"calories_per_egg": 78, "protein": 6.3, "carbs": 0.6, "fat": 5.0},
            ),
            CatalogItem(
                "food_oatmeal",
                "Oatmeal",
                EntityType.FOOD,
                aliases=["oats", "rolled oats", "avena", "porridge"],
                metadata={"calories_per_100g": 389, "protein": 16.9, "carbs": 66, "fat": 6.9},
            ),
            CatalogItem(
                "food_greek_yogurt",
                "Greek Yogurt",
                EntityType.FOOD,
                aliases=["yogurt", "yogurt griego", "skyr"],
                metadata={"calories_per_100g": 59, "protein": 10, "carbs": 3.6, "fat": 0.4},
            ),
            CatalogItem(
                "food_sweet_potato",
                "Sweet Potato",
                EntityType.FOOD,
                aliases=["sweet potatoes", "yam", "boniato", "batata", "patata dulce"],
                metadata={"calories_per_100g": 86, "protein": 1.6, "carbs": 20, "fat": 0.1},
            ),
            CatalogItem(
                "food_banana",
                "Banana",
                EntityType.FOOD,
                aliases=["platano", "bananas", "platanos"],
                metadata={"calories_per_item": 105, "protein": 1.3, "carbs": 27, "fat": 0.3},
            ),
            CatalogItem(
                "food_whey_protein",
                "Whey Protein",
                EntityType.FOOD,
                aliases=["protein powder", "whey", "protein shake", "batido de proteina"],
                metadata={"calories_per_scoop": 120, "protein": 24, "carbs": 2, "fat": 1.5},
            ),
            CatalogItem(
                "food_broccoli",
                "Steamed Broccoli",
                EntityType.FOOD,
                aliases=["broccoli", "brocoli"],
                metadata={"calories_per_100g": 35, "protein": 2.4, "carbs": 7, "fat": 0.4},
            ),
            CatalogItem(
                "food_olive_oil",
                "Olive Oil",
                EntityType.FOOD,
                aliases=["oil", "aceite de oliva", "aceite"],
                metadata={"calories_per_tbsp": 119, "protein": 0, "carbs": 0, "fat": 14},
            ),
            CatalogItem(
                "food_avocado",
                "Avocado",
                EntityType.FOOD,
                aliases=["aguacate", "palta"],
                metadata={"calories_per_100g": 160, "protein": 2, "carbs": 9, "fat": 15},
            ),
            # Meals
            CatalogItem(
                "meal_breakfast",
                "Breakfast",
                EntityType.MEAL,
                aliases=["desayuno", "morning meal"],
                metadata={"typical_hour": 8},
            ),
            CatalogItem(
                "meal_lunch",
                "Lunch",
                EntityType.MEAL,
                aliases=["almuerzo", "comida", "midday meal"],
                metadata={"typical_hour": 13},
            ),
            CatalogItem(
                "meal_dinner",
                "Dinner",
                EntityType.MEAL,
                aliases=["cena", "evening meal"],
                metadata={"typical_hour": 20},
            ),
            CatalogItem(
                "meal_snack",
                "Snack",
                EntityType.MEAL,
                aliases=["merienda", "colacion", "snack time"],
                metadata={"typical_hour": 17},
            ),
            CatalogItem(
                "meal_post_workout",
                "Post-Workout Meal",
                EntityType.MEAL,
                aliases=["post workout", "post entreno", "post-workout shake"],
                metadata={"typical_hour": 19},
            ),
        ]

        try:
            from app.services.wger_importer import load_cached_exercises

            existing_ids = {item.id for item in items}
            for ex in load_cached_exercises():
                if ex.id not in existing_ids:
                    items.append(
                        CatalogItem(
                            item_id=ex.id,
                            name=ex.name,
                            category=EntityType.EXERCISE,
                            aliases=ex.aliases,
                            metadata={
                                "primary_muscle": ex.muscles[0] if ex.muscles else ex.category,
                                "equipment": ex.equipment[0] if ex.equipment else "bodyweight",
                                "wger_id": ex.wger_id,
                            },
                        )
                    )
        except Exception:
            pass

        return items

    def _extract_ngrams(self, text: str, min_n: int = 1, max_n: int = 4) -> list[str]:
        """Generate candidate n-gram tokens from the normalized text."""
        words = normalize_text(text).split()
        ngrams: list[str] = []
        for n in range(min_n, min(max_n + 1, len(words) + 1)):
            for i in range(len(words) - n + 1):
                chunk = words[i : i + n]
                if n > 1 and (chunk[0] in STOP_WORDS or chunk[-1] in STOP_WORDS):
                    continue
                ngrams.append(" ".join(chunk))
        return ngrams

    def _detect_intent(self, text: str, foods: list, exercises: list, routines: list) -> str:
        """Heuristically identify the user's primary conversational intent."""
        norm = normalize_text(text)
        strong_exercises = [e for e in exercises if getattr(e, "score", 0) >= 0.8]
        strong_foods = [f for f in foods if getattr(f, "score", 0) >= 0.8]

        has_workout_words = bool(
            strong_exercises
            or routines
            or any(w in norm for w in ["routine", "workout", "sets", "reps", "gym", "train", "rutina", "entreno"])
        )
        has_nutrition_words = bool(
            strong_foods
            or any(w in norm for w in ["meal", "eat", "food", "calorie", "lunch", "dinner", "breakfast", "comida", "calorias"])
        )

        if has_workout_words and has_nutrition_words:
            return "setup_routine_and_meal"
        if has_workout_words:
            return "setup_routine"
        if has_nutrition_words:
            return "log_meal"
        return "general_fitness"

    def match(
        self,
        text: str,
        threshold: float = 0.65,
        limit_per_category: int = 5,
    ) -> ParseNaturalLanguageResponse:
        """Extract recognized database objects from conversational text."""
        ngrams = self._extract_ngrams(text)
        matches_by_id: dict[str, tuple[CatalogItem, float, str]] = {}

        for item in self.catalog:
            best_score = 0.0
            best_term = ""

            for term in item.all_search_terms:
                # Direct check on entire input text first
                full_sim = calculate_similarity(text, term)
                if full_sim > best_score:
                    best_score = full_sim
                    best_term = term

                # N-gram checking for phrases within longer sentences
                for ngram in ngrams:
                    score = calculate_similarity(ngram, term)
                    if score > best_score:
                        best_score = score
                        best_term = ngram

            if best_score >= threshold:
                matches_by_id[item.id] = (item, round(best_score, 3), best_term)

        # Categorize results
        categorized: dict[EntityType, list[MatchedEntity]] = {
            EntityType.FOOD: [],
            EntityType.EXERCISE: [],
            EntityType.ROUTINE: [],
            EntityType.MEAL: [],
        }

        for item, score, matched_term in matches_by_id.values():
            categorized[item.category].append(
                MatchedEntity(
                    id=item.id,
                    name=item.name,
                    category=item.category,
                    score=score,
                    matched_term=matched_term,
                    metadata=item.metadata,
                )
            )

        # Sort each category by score descending and apply limit
        for cat in categorized:
            categorized[cat].sort(key=lambda m: m.score, reverse=True)
            categorized[cat] = categorized[cat][:limit_per_category]

        detected_intent = self._detect_intent(
            text,
            categorized[EntityType.FOOD],
            categorized[EntityType.EXERCISE],
            categorized[EntityType.ROUTINE],
        )

        return ParseNaturalLanguageResponse(
            original_text=text,
            detected_intent=detected_intent,
            foods=categorized[EntityType.FOOD],
            exercises=categorized[EntityType.EXERCISE],
            routines=categorized[EntityType.ROUTINE],
            meals=categorized[EntityType.MEAL],
        )


_default_matcher: FuzzyEntityMatcher | None = None


def get_fuzzy_matcher() -> FuzzyEntityMatcher:
    """Singleton provider for the FuzzyEntityMatcher."""
    global _default_matcher
    if _default_matcher is None:
        _default_matcher = FuzzyEntityMatcher()
    return _default_matcher
