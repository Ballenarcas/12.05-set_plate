/** @typedef {{ calories: number, protein: number, carbs: number, fat: number, quantityGrams: number }} MealNutrition */

/** @param {readonly MealNutrition[]} foods
 *  @returns {MealNutrition}
 */
export function summarizeMeal(foods) {
  return foods.reduce(
    (total, food) => ({
      calories: total.calories + food.calories,
      protein: total.protein + food.protein,
      carbs: total.carbs + food.carbs,
      fat: total.fat + food.fat,
      quantityGrams: total.quantityGrams + food.quantityGrams,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, quantityGrams: 0 },
  )
}
