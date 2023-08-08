//EJECUTA 1 FUNCION

#include <iostream>
#include <fstream>
#include <sstream>
#include <string>


const int MAX_PELICULAS = 1000;
int preRegistradas = 0;
struct Pelicula {
    std::string titulo;
    std::string director;
    int anio;
    std::string actores;
    std::string genero;
    int puntuacion;
    bool vista;
};

Pelicula peliculas[MAX_PELICULAS];
std::ofstream archivoPeliculas("base_peliculas.txt");

void leerBaseDeDatos();
void mostrarTodasLasPeliculas();
void mostrarInfoPelicula(); 
void mostrarInfoPeliculaPorDirector();
void mostrarPeliculasPorGenero();
void mostrarPeliculasPorAnio();
void marcarPeliculaComoVista();
void puntuarPelicula();
 void mostrarTopPeliculas();
int main(){
    
    std::string genero,titulo,director;
    // Escribir datos de películas en el archivo
    archivoPeliculas << "Matrix|Lana Wachowski|1999|Keanu Reeves, Laurence Fishburne|Ciencia Ficción" << std::endl;
    archivoPeliculas << "El Padrino|Francis Ford Coppola|1972|Marlon Brando, Al Pacino, James Caan|Crimen" << std::endl;
    archivoPeliculas << "El Señor de los Anillos: La Comunidad del Anillo|Peter Jackson|2001|Elijah Wood, Ian McKellen, Viggo Mortensen|Aventura" << std::endl;
    archivoPeliculas << "Forrest Gump|Robert Zemeckis|1994|Tom Hanks, Robin Wright, Gary Sinise|Comedia" << std::endl;
    archivoPeliculas << "Star Wars: Episodio IV - Una Nueva Esperanza|George Lucas|1977|Mark Hamill, Harrison Ford, Carrie Fisher|Aventura" << std::endl;
    archivoPeliculas << "Pulp Fiction|Quentin Tarantino|1994|John Travolta, Uma Thurman, Samuel L. Jackson|Crimen" << std::endl;
    archivoPeliculas << "El club de la pelea|David Fincher|1999|Brad Pitt, Edward Norton, Helena Bonham Carter|Drama" << std::endl;
    archivoPeliculas << "El silencio de los inocentes|Jonathan Demme|1991|Jodie Foster, Anthony Hopkins|Drama|Crimen" << std::endl;
    archivoPeliculas << "El rey leon|Roger Allers, Rob Minkoff|1994|Matthew Broderick, Jeremy Irons, James Earl Jones|Animación|Aventura" << std::endl;
    archivoPeliculas << "Volver al futuro|Robert Zemeckis|1985|Michael J. Fox, Christopher Lloyd|Ciencia Ficción|Comedia" << std::endl;
    archivoPeliculas << "Harry Potter y la piedra filosofal|Chris Columbus|2001|Daniel Radcliffe, Emma Watson, Rupert Grint|Fantasía" << std::endl;
    // Cerrar el archivo
archivoPeliculas.close();
leerBaseDeDatos();
int opcion;


std::string entrada;

 while (opcion != 9) {
  
std::cout << "====================================================================================================" << std::endl;
std::cout << "              ██╗   ██╗   █████╗  ███╗   ██╗      ██ █████╗ ██╗     ██╗  ██║    ██║              " << std::endl;
std::cout << "              ██║   ██║  ██╔══██╗ ████╗  ██╝      ██╔══╝    ██║     ██║   ║██╗ ██║               " << std::endl;
std::cout << "              ██║   ██║  ███████║ ██╔██╗ ██║      █████╗    ██║     ██║    ╚███║                " << std::endl;
std::cout << "              ██║   ██║  ██╔══██║ ██║╚██╗██║      ██╔══╝    ██║     ██║  ║██    ██║              " << std::endl;
std::cout << "              ╚██████╔╝  ██║  ██║ ██║ ╚████║      ██║       ███████╗██║ ║██║     ██║             " << std::endl;
std::cout << "               ╚═════╝   ╚═╝  ╚═╝ ╚═╝  ╚═══╝      ╚═╝       ╚══════╝╚═╝ ╚══╝    ╚══╝             " << std::endl;
std::cout << "====================================================================================================" << std::endl;
std::cout << std::endl;
std::cout << "====================================" << std::endl;
std::cout << "+      Bienvenido a UANflix         +" << std::endl;
std::cout << "+  Explora nuestro catálogo         +" << std::endl;
std::cout << "====================================" << std::endl;
std::cout << "+====+" << std::endl;
std::cout << "+  1 + Mostrar todas las películas " << std::endl;
std::cout << "+  2 + Mostrar información por nombre" << std::endl;
std::cout << "+  3 + Mostrar información por Director" << std::endl;
std::cout << "+  4 + Mostrar información por género" << std::endl;
std::cout << "+  5 + Mostrar información por año  " << std::endl;
std::cout << "+  6 + Marcar como vista           " << std::endl;
std::cout << "+  7 + Puntuar                      " << std::endl;
std::cout << "+  8 + Top 10 de películas         " << std::endl;
std::cout << "+  9 + Salir                       " << std::endl;
std::cout << "+====+" << std::endl;




        std::cout << "Ingrese una opción: "<< std::endl;
        std::cout << std::endl;
        std::cin >> entrada;

        // Verificar si la entrada es un número
        bool es_numero = true;
        for (char c : entrada) {
            if (!isdigit(c)) {
                es_numero = false;
                break;
            }
        }

        if (es_numero) {
            opcion = std::stoi(entrada);

            if (opcion >= 1 && opcion <= 9) {
                 switch(opcion){
        
        case 1:
        mostrarTodasLasPeliculas();
        break;
        
        case 2:
        mostrarInfoPelicula();
        break;
        
        case 3:
        mostrarInfoPeliculaPorDirector();
        break;
        
        case 4:
        mostrarPeliculasPorGenero();
        break;
        
        case 5:
        mostrarPeliculasPorAnio();
        break;
        
        case 6:
        marcarPeliculaComoVista();
        break;
        
        case 7:
        puntuarPelicula();
        break;
        
        case 8:
        mostrarTopPeliculas();
        break;
        
        default:
        "Esta opcion no se encuentra en el menú";

        break;
                }
            } else {
                std::cout << "Opción inválida. Por favor ingrese un número del 1 al 9." << std::endl;
            }
        } else {
            std::cout << "Entrada inválida. Por favor ingrese un número del 1 al 9." << std::endl;
        }
    }
}

void leerBaseDeDatos() {
    std::ifstream archivoPeliculas("base_peliculas.txt");
    std::string linea;

    while (std::getline(archivoPeliculas, linea)) {
        std::stringstream ss(linea);
        std::string campo;
        int indice = 0;

        while (std::getline(ss, campo, '|')) {
            switch (indice) {
                case 0:
                    peliculas[preRegistradas].titulo = campo;
                    break;
                case 1:
                    peliculas[preRegistradas].director = campo;
                    break;
                case 2:
                    peliculas[preRegistradas].anio = std::stoi(campo);
                    break;
                case 3:
                    peliculas[preRegistradas].actores = campo;
                    break;
                case 4:
                    peliculas[preRegistradas].genero = campo;
                    break;
                default:
                    break;
            }
            indice++;
        }
        peliculas[preRegistradas].puntuacion = 0;
        peliculas[preRegistradas].vista = false;
        preRegistradas++;
    }
}

void mostrarTodasLasPeliculas() {
    system("clear");
    std::cout << "╔═════════════════════════════════════════════════════╗" << std::endl;
    std::cout << "║                  PELICULAS DISPONIBLES              ║" << std::endl;
    std::cout << "╟─────────────────────────────────────────────────────╢" << std::endl;
    for (int i = 0; i < preRegistradas; i++) {
        std::cout << "║ Título:     " << peliculas[i].titulo << std::endl;
        std::cout << "║ Director:   " << peliculas[i].director << std::endl;
        std::cout << "║ Año:        " << peliculas[i].anio << std::endl;
        std::cout << "║ Actores:    " << peliculas[i].actores << std::endl;
        std::cout << "║ Género:     " << peliculas[i].genero << std::endl;
        std::cout << "║ Puntuación: " << peliculas[i].puntuacion << std::endl;
        std::cout << "║ Vista:      " << (peliculas[i].vista ? "Sí" : "No") << std::endl;
        std::cout << "╟───────────────────────────────────────────────────── ╢" << std::endl;
    }
         std::cout << "╚═════════════════════════════════════════════════════╝" << std::endl;
}




void mostrarInfoPelicula() {
    system("clear");
    std::string titulo;
    std::cout << "Ingresa el título de la película: ";
    std::getline(std::cin >> std::ws, titulo);

    bool encontrada = false;
    for (int i = 0; i < preRegistradas; i++) {
        if (peliculas[i].titulo == titulo) {
            encontrada = true;
            std::cout << std::endl;
            std::cout << "╔═════════════════════════════════════════        ╗" << std::endl;
            std::cout << "║   INFORMACION DE LA PELICULA \""<< titulo <<"\" ║" << std::endl;
            std::cout << "╟───────────────────────────────────────────      ╢" << std::endl;
            std::cout << "║ Título:     " << peliculas[i].titulo <<    "║" << std::endl;
            std::cout << "║ Director:   " << peliculas[i].director <<  "║" << std::endl;
            std::cout << "║ Año:        " << peliculas[i].anio <<      "║" << std::endl;
            std::cout << "║ Actores:    " << peliculas[i].actores <<   "║" << std::endl;
            std::cout << "║ Género:     " << peliculas[i].genero <<    "║" << std::endl;
            std::cout << "║ Puntuación: " << peliculas[i].puntuacion <<"║" << std::endl;
            std::cout << "║ Vista:      " << (peliculas[i].vista ? "Sí" : "No") << "║" << std::endl;
            std::cout << "╚═════════════════════════════════════════╝" << std::endl;
            
            break;
            
        }
    }
    if (!encontrada) {
        std::cout << std::endl;
        std::cout << "No se encontró la película" << std::endl;
    }
}

void mostrarPeliculasPorGenero() {
    system("clear");
    std::string genero;
    std::cout << std::endl;
    std::cout << "Ingrese el género que desea ver: ";
    std::cin >> genero;
    std::cout << std::endl;
    std::cout << "╔═══════════════════════════════════════════════╗" << std::endl;
    std::cout << "║        Películas de " << genero << "        ║" << std::endl;
    std::cout << "╟───────────────────────────────────────────────╢" << std::endl;
    bool encontradas = false;
    for (int i = 0; i < preRegistradas; i++) {
        if (peliculas[i].genero == genero) {
            encontradas = true;
            std::cout << "║ " << peliculas[i].titulo << " (" << peliculas[i].anio << ")" << std::endl;
        }
    }
    if (!encontradas) {
        std::cout << "║                                               ║" << std::endl;
        std::cout << "║ No se encontraron películas de " << genero << " ║" << std::endl;
    }
    std::cout << "╚═══════════════════════════════════════════════╝" << std::endl;
}


void mostrarPeliculasPorAnio() {
    system("clear");
    int anioBuscado;
    bool encontrada = false;
    std::cout << std::endl;
    std::cout << "Ingrese el año de lanzamiento de las películas que desea buscar: ";
    std::cin >> anioBuscado;
    std::cout << std::endl;
    std::cout << "╔══════════════════════════════════════════╗" << std::endl;
    std::cout << "║  Películas lanzadas en el año " << anioBuscado << ":  ║" << std::endl;
    std::cout << "╟────────────────────────────────────────────╢" << std::endl;

    for (int i = 0; i < preRegistradas; i++) {
        if (peliculas[i].anio == anioBuscado) {
            std::cout << "║ " << peliculas[i].titulo << " (" << peliculas[i].anio << ")" << std::endl;
            encontrada = true;
        }
    }

    if (!encontrada) {
        std::cout << "║                                            ║" << std::endl;
        std::cout << "║ No se encontraron películas para el año " << anioBuscado << "." << std::endl;
    }

    std::cout << "╚══════════════════════════════════════════╝" << std::endl;
}


void mostrarInfoPeliculaPorDirector() {
    system("clear");
    std::string director;
    std::cout << "Ingresa el director de la película: ";
    std::getline(std::cin >> std::ws, director);

    bool encontrada = false;
    std::cout << std::endl;
    std::cout << "╔══════════════════════════════════════════╗" << std::endl;
    std::cout << "║  Información de las películas disponibles  ║" << std::endl;
    std::cout << "║          del director " << director << "           ║" << std::endl;
    std::cout << "╟────────────────────────────────────────────╢" << std::endl;

    for (int i = 0; i < preRegistradas; i++) {
        if (peliculas[i].director == director) {
            encontrada = true;
            std::cout << "║ Título:    " << peliculas[i].titulo << std::endl;
            std::cout << "║ Director:  " << peliculas[i].director << std::endl;
            std::cout << "║ Año:       " << peliculas[i].anio << std::endl;
            std::cout << "║ Actores:   " << peliculas[i].actores << std::endl;
            std::cout << "║ Género:    " << peliculas[i].genero << std::endl;
            std::cout << "║ Puntuación:" << peliculas[i].puntuacion << std::endl;
            std::cout << "║ Vista:     " << (peliculas[i].vista ? "Sí" : "No") << std::endl;
            std::cout << "╟────────────────────────────────────────────╢" << std::endl;
        }
    }

    if (!encontrada) {
        std::cout << "║                                            ║" << std::endl;
        std::cout << "║ No se encontraron películas de ese director ║" << std::endl;
        std::cout << "╚══════════════════════════════════════════╝" << std::endl;
    }
}

void marcarPeliculaComoVista() {
    system("clear");
    std::string titulo;
    std::cout << std::endl;
    std::cout << "╔══════════════════════════════╗" << std::endl;
    std::cout << "║       Marcar como Vista       ║" << std::endl;
    std::cout << "╚══════════════════════════════╝" << std::endl;
    std::cout << std::endl;
    std::cout << "Ingrese el título de la película que desea marcar como vista: ";
    std::cin.ignore();
    std::getline(std::cin, titulo);

    for (int i = 0; i < preRegistradas; i++) {
        if (peliculas[i].titulo == titulo) {
            std::cout << std::endl;
            std::cout << "╔══════════════════════════════╗" << std::endl;
            std::cout << "║         Información           ║" << std::endl;
            std::cout << "╚══════════════════════════════╝" << std::endl;
            std::cout << "Título:     " << peliculas[i].titulo << std::endl;
            std::cout << "Director:   " << peliculas[i].director << std::endl;
            std::cout << "Año:        " << peliculas[i].anio << std::endl;
            std::cout << "Actores:    " << peliculas[i].actores << std::endl;
            std::cout << "Género:     " << peliculas[i].genero << std::endl;
            std::cout << "Puntuación: " << peliculas[i].puntuacion << std::endl;
            std::cout << "¿Vista?:    " << (peliculas[i].vista ? "Sí" : "No") << std::endl;
            std::cout << std::endl;
            std::cout << "¿Desea marcar la película como vista? (S/N): ";
            char opcion;
            std::cin >> opcion;
            std::cout << std::endl;

            if (opcion == 'S' || opcion == 's') {
                peliculas[i].vista = true;
                std::cout << "╔══════════════════════════════╗" << std::endl;
                std::cout << "║     Película marcada como     ║" << std::endl;
                std::cout << "║           vista.              ║" << std::endl;
                std::cout << "╚══════════════════════════════╝" << std::endl;
                std::cout << std::endl;
            } else {
                peliculas[i].vista = false;
                std::cout << "╔══════════════════════════════╗" << std::endl;
                std::cout << "║   Película marcada como no    ║" << std::endl;
                std::cout << "║           vista.              ║" << std::endl;
                std::cout << "╚══════════════════════════════╝" << std::endl;
                std::cout << std::endl;
            }
            // Se guarda la información actualizada de la película en el archivo
            archivoPeliculas.close();
            archivoPeliculas.open("base_peliculas.txt", std::ofstream::out | std::ofstream::trunc);
            for (int j = 0; j < preRegistradas; j++) {
                archivoPeliculas << peliculas[j].titulo << "|" << peliculas[j].director << "|" << peliculas[j].anio
                                 << "|" << peliculas[j].actores << "|" << peliculas[j].genero << "|" << peliculas[j].puntuacion
                                 << "|" << (peliculas[j].vista ? "1" : "0") << std::endl;
            }
            archivoPeliculas.close();
            break;
        }
    }
}


void puntuarPelicula() {
    std::string titulo;
    std::cout << std::endl;
    std::cout << "╔══════════════════════════════╗" << std::endl;
    std::cout << "║     Puntuar Película         ║" << std::endl;
    std::cout << "╚══════════════════════════════╝" << std::endl;
    std::cout << std::endl;
    std::cout << "Ingrese el título de la película que desea puntuar: ";
    std::cin.ignore();
    std::getline(std::cin, titulo);

    // Buscar la película por título
    bool encontrada = false;
    for (int i = 0; i < preRegistradas; i++) {
        if (peliculas[i].titulo == titulo) {
            encontrada = true;

            // Verificar si la película ha sido marcada como vista
            if (!peliculas[i].vista) {
                std::cout << "La película debe ser marcada como vista antes de poder puntuarla." << std::endl;
                marcarPeliculaComoVista();
            }

            std::cout << std::endl;
            std::cout << "Puntuación actual: " << peliculas[i].puntuacion << std::endl;
            std::cout << "Ingrese la nueva puntuación (0-10): ";
            int puntuacion;
            std::cin >> puntuacion;

            // Validar la puntuación
            if (puntuacion < 0 || puntuacion > 10) {
                std::cout << "La puntuación debe estar entre 0 y 10." << std::endl;
            } else {
                peliculas[i].puntuacion = puntuacion;
                std::cout << "╔══════════════════════════════╗" << std::endl;
                std::cout << "║    Puntuación actualizada     ║" << std::endl;
                std::cout << "║      correctamente.           ║" << std::endl;
                std::cout << "╚══════════════════════════════╝" << std::endl;
            }
            break;
        }
    }

    if (!encontrada) {
        std::cout << std::endl;
        std::cout << "No se encontró la película." << std::endl;
    }
}


void mostrarTopPeliculas() {
    // Verificar si hay películas registradas
    if (preRegistradas == 0) {
        std::cout << "No hay películas registradas." << std::endl;
        return;
    }

    // Ordenar las películas por puntuación de mayor a menor
    for (int i = 0; i < preRegistradas - 1; i++) {
        for (int j = 0; j < preRegistradas - i - 1; j++) {
            if (peliculas[j].puntuacion < peliculas[j + 1].puntuacion) {
                std::swap(peliculas[j], peliculas[j + 1]);
            }
        }
    }

    std::cout << "╔══════════════════════════════╗" << std::endl;
    std::cout << "║         Top 10 Películas      ║" << std::endl;
    std::cout << "╠══════════════════════════════╣" << std::endl;

    // Mostrar los títulos de las primeras 10 películas del arreglo ordenado
    int limite = std::min(preRegistradas, 10);
    for (int i = 0; i < limite; i++) {
        std::cout << "║ " << peliculas[i].titulo << " ║" << std::endl;
    }

    std::cout << "╚══════════════════════════════╝" << std::endl;
}




    




