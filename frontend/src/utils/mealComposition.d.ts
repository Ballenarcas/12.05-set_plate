export type MealNutrition = {
  calories: number
  protein: number
  carbs: number
  fat: number
  quantityGrams: number
}

export function summarizeMeal(foods: readonly MealNutrition[]): MealNutrition
