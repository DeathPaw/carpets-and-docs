package ru.carpet.service;

import java.util.Set;

/**
 * Предположение пола по ФИО (V47, правка №1 от 13.09).
 *
 * <p>Оператор редко спрашивает пол напрямую, но он нужен для портрета базы.
 * Отчество даёт почти стопроцентный ответ, имя — вероятный. Если уверенности
 * нет, возвращаем {@code null}: пустое поле честнее неверного, и оператор
 * всегда может поставить значение руками.
 */
public final class GenderGuesser {

    private GenderGuesser() {}

    /** Мужские имена, оканчивающиеся на «а»/«я» — иначе они уходили бы в женские. */
    private static final Set<String> MALE_EXCEPTIONS = Set.of(
            "никита", "илья", "лука", "фома", "савва", "данила", "гаврила", "кузьма",
            "добрыня", "джа", "муса", "иса", "мустафа", "сергия");

    /**
     * @param fullName полное ФИО («Литвинова Дарья Ильинична»)
     * @param firstName имя, если заполнено отдельно
     * @return MALE | FEMALE | null (не удалось определить)
     */
    public static String guess(String fullName, String firstName) {
        String[] words = ((fullName == null ? "" : fullName) + " " + (firstName == null ? "" : firstName))
                .toLowerCase().split("[^а-яёa-z]+");

        // 1. Отчество — самый надёжный признак.
        for (String w : words) {
            if (w.length() < 5) continue;
            if (w.endsWith("вна") || w.endsWith("чна")) return "FEMALE";
            if (w.endsWith("вич") || w.endsWith("ьич")) return "MALE";
        }

        // 2. Имя. Берём то, что оператор ввёл в поле «Имя», иначе второе слово ФИО
        //    (обычный порядок — Фамилия Имя Отчество).
        String name = firstName != null && !firstName.isBlank()
                ? firstName.trim().toLowerCase()
                : (words.length > 1 ? words[1] : "");
        if (name.isEmpty()) return null;
        if (MALE_EXCEPTIONS.contains(name)) return "MALE";
        if (name.endsWith("а") || name.endsWith("я")) return "FEMALE";
        // Согласная на конце — почти всегда мужское имя (Иван, Пётр, Артём).
        if (name.matches(".*[бвгджзклмнпрстфхцчшщй]$")) return "MALE";
        return null;
    }
}
