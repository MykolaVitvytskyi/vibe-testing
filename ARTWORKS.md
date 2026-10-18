# Коллекция и источники изображений

В вымышленном музее показаны **цифровые репродукции настоящих произведений**. Указанные музеи хранят оригиналы или, в случае гравюры Хокусая, отдельные оттиски. Здание и расположение залов придуманы для проекта.

Все шесть произведений созданы до 1930 года; авторы умерли более 70 лет назад. Оригиналы находятся в общественном достоянии в США и странах со сроком охраны «жизнь автора + 70 лет». Использованы плоские цифровые репродукции, а не современные переработки, изображения, сгенерированные нейросетью, или новые художественные фотографии.

Репродукции скачаны из открытых учебных репозиториев GitHub, а не с сайтов музеев. Ссылки музеев ниже служат для справки об оригиналах; лицензия программного кода этих репозиториев сама по себе не является лицензией на все вложенные изображения.

| Локальный файл | Произведение | Оригинал / справочная ссылка | Файл репродукции |
| --- | --- | --- | --- |
| `assets/art/starry-night.jpg` | Винсент ван Гог (1853–1890), «Звёздная ночь», 1889; холст, масло | [MoMA, инв. 472.1941](https://www.moma.org/collection/works/79802) | [jcjohnson/fast-neural-style](https://raw.githubusercontent.com/jcjohnson/fast-neural-style/master/images/styles/starry_night.jpg) |
| `assets/art/the-great-wave.jpg` | Кацусика Хокусай (1760–1849), «Большая волна в Канагаве», около 1830–1832; цветная ксилография | [Метрополитен-музей: один из сохранившихся оттисков, JP1847](https://www.metmuseum.org/art/collection/search/45434) | [jcjohnson/fast-neural-style](https://raw.githubusercontent.com/jcjohnson/fast-neural-style/master/images/styles/wave.jpg) |
| `assets/art/the-scream.jpg` | Эдвард Мунк (1863–1944), «Крик», 1893; темпера и мелки на картоне | [Национальный музей, Осло, NG.M.00939](https://www.nasjonalmuseet.no/en/collection/object/NG.M.00939) | [jcjohnson/fast-neural-style](https://raw.githubusercontent.com/jcjohnson/fast-neural-style/master/images/styles/the_scream.jpg) |
| `assets/art/the-shipwreck.jpg` | Джозеф Мэллорд Уильям Тёрнер (1775–1851), «Кораблекрушение», 1805; холст, масло | [Тейт, N00476](https://www.tate.org.uk/art/artworks/turner-the-shipwreck-n00476) | [titu1994/Neural-Style-Transfer](https://raw.githubusercontent.com/titu1994/Neural-Style-Transfer/master/images/inputs/style/shipwreck.jpg) |
| `assets/art/composition-vii.jpg` | Василий Кандинский (1866–1944), «Композиция VII», 1913; холст, масло | [Государственная Третьяковская галерея, коллекция](https://www.tretyakovgallery.ru/collection/) | [jcjohnson/fast-neural-style](https://raw.githubusercontent.com/jcjohnson/fast-neural-style/master/images/styles/composition_vii.jpg) |
| `assets/art/udnie.jpg` | Франсис Пикабиа (1879–1953), «Удни. Молодая американская девушка (Танец)», 1913; холст, масло | [Национальный музей современного искусства — Центр Помпиду](https://www.centrepompidou.fr/en/) | [jcjohnson/fast-neural-style](https://raw.githubusercontent.com/jcjohnson/fast-neural-style/master/images/styles/udnie.jpg) |

## О репродукциях

- Файлы скопированы без изменения пикселей и проверены декодированием и визуальным просмотром. Все файлы меньше 500 КБ, общий размер около 1,5 МБ.
- Некоторые учебные исходники имеют кадрирование и цветопередачу, отличающиеся от музейных сканов. Особенно заметно кадрирование «Звёздной ночи» и «Большой волны». Проект сохраняет соотношение сторон каждого файла и не выдаёт эти копии за полные музейные сканы.
- В таблице указан музейный пример оттиска «Большой волны»; точное происхождение оттиска на учебной репродукции не установлено.
- Русские пояснения написаны для проекта. Они не являются цитатами из музейных текстов.

Для замены изображения достаточно сохранить новый файл и обновить `image` в `src/collection.js`; карточки используют данные из того же массива `artworks`.
