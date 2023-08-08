#include <iostream>
#include <conio.h>
using namespace std;

int main(){
	
	int numero = 0, total1 = 0, total2 = 0, total3 = 0, costo1 = 0, costo2 = 0, costo3 = 0,horas,i,numero1,numero2,numero3,dtotal,
	opcionu, A, U, cAgregar1 = 0, cAgregar2 = 0, cAgregar3 = 0,  ntotal = 0,  ctotal=0,minutos;

	
	int duracionL1 [100] = {0};
	int costoL1 [100] = {0};
	int duracionL2 [100] = {0};
	int costoL2 [100] = {0};
	int duracionL3 [100] = {0};
	int costoL3 [100] = {0};
	
	do {
	
	cout<<"||================================================================================================||"<<endl;
  	cout<<"                                BIENVENIDO  A LAS CABINAS TELEFONICAS                               "<<endl;
  	cout<<"||================================================================================================||"<<endl;
  	cout<<"||                                       MENU DE LA CABINA                                        ||"<<endl;
    cout<<"||                                                                                                ||"<<endl;
    cout<<"||                    Por favor digite el n�mero (1-4) de lo que desea realizar en el menu :     ||"<<endl;         
    cout<<"||                                                                                                ||"<<endl;
  	cout<<"||                                                                                                ||"<<endl;
  	cout<<"||                              1. Agregar una llamada                                            ||"<<endl;
  	cout<<"||                              2. Visualizar la informacion de una linea telefonica              ||"<<endl;
  	cout<<"||                              3. Visualizar la informacion total de las lineas                  ||"<<endl;
  	cout<<"||                              4. Reiniciar las lineas telefonicas                               ||"<<endl;
  	cout<<"||                              5. Terminar                                                       ||"<<endl;
  	cout<<"||================================================================================================||"<<endl;
	cin >>opcionu;
	

		switch (opcionu){
			case 1:
			
				cout<<"||================================================================================================||"<<endl;
  				cout<<"                               SEA BIENVENIDO A LAS LINEAS TELEFONICAS                              "<<endl;
  				cout<<"||================================================================================================||"<<endl;
  				cout<<"||                              1. Linea Telefonica Primaria                                      ||"<<endl;
  				cout<<"||                              2. Linea Telefonica Secundaria                                    ||"<<endl;
  				cout<<"||                              3. Linea Telefonica Terciaria                                     ||"<<endl;
 			 	cout<<"||                              4. Terminar                                                       ||"<<endl;
 			 	cout<<"||                                                                                                ||"<<endl;
 			 	cout<<"||================================================================================================||"<<endl;
  				cout<<" Para seleccionar la linea que desea usar, por favor, ingrese un numero dentro del rango (1-3) : "<<endl;
  				cin >>U; 
  				
				
				while (U != 4){
					switch (U){
						case 1:
							cout<<"||================================================================================================||"<<endl;
  							cout<<"                               TIPO DE LLAMADA                                                      "<<endl;
  	 						cout<<"||================================================================================================||"<<endl;
  							cout<<"||                              1. Llamada local                                                  ||"<<endl;
  							cout<<"||                              2. Llamada a larga distancia                                      ||"<<endl;
  							cout<<"||                              3. Llamada a celular                                              ||"<<endl;
  							cout<<"||                                                                                                ||"<<endl;
  							cout<<"||                                                                                                ||"<<endl;
  							cout<<"||================================================================================================||"<<endl;
  							cout<<" Para seleccionar el tipo de llamada que desea realizar, por favor, ingrese un numero dentro del rango (1-3) : "<<endl;
  							
							cin >>A;
							
							cout<<"           Ingrese la duracion de su llamada en horas y minutos: "<<endl;
							cout<<"         Si su llamada posee una duracion menor a 60 minutos digite 0."<<endl;
							
							if (horas!=0){
	    
	                        cout <<"  Horas: "<<endl;
							cin >> horas;
								horas*=60;
							}else if (horas=0){
								horas=0;
							}
	
							cout <<"  Minutos: "<<endl;
							cin >> minutos;
	
				
							numero=horas+minutos;
						
							
							switch (A) {
								case 1:
									numero1 = numero * 35;
									costoL1[i]+=numero1;
									cAgregar1 += 1;
									duracionL1[i]+=numero;
									break;
									
								case 2:
									numero1 = (numero * 380);
									costoL1[i]+=numero1;
									cAgregar1 += 1;
									duracionL1[i]+=numero;
									break;
									
								case 3:
								    numero1 = (numero * 999);
									costoL1[i]+=numero1;
									cAgregar1 += 1;
									duracionL1[i]+=numero;
									break;
								
								default:
									cout <<"La opcion seleccionada no es valida, vuelve a intentarlo"<<endl;
							}
							
  					
							break;
							
						case 2:
							cout<<"||================================================================================================||"<<endl;
  							cout<<"                               TIPO DE LLAMADA                                                      "<<endl;
  	 						cout<<"||================================================================================================||"<<endl;
  							cout<<"||                              1. Llamada local                                                  ||"<<endl;
  							cout<<"||                              2. Llamada a larga distancia                                      ||"<<endl;
  							cout<<"||                              3. Llamada a celular                                              ||"<<endl;
  							cout<<"||                                                                                                ||"<<endl;
  							cout<<"||                                                                                                ||"<<endl;
  							cout<<"||================================================================================================||"<<endl;
  							cout<<" Para seleccionar el tipo de llamada que desea realizar, por favor, ingrese un numero dentro del rango (1-3) : "<<endl;
							cin >> A;
							if (horas!=0){
	    
	                        cout <<"  Horas: "<<endl;
							cin >> horas;
								horas*=60;
							}else if (horas=0){
								horas=0;
							}
	
							cout <<"  Minutos: "<<endl;
							cin >> minutos;
	
				
							numero=horas+minutos;
							
							switch (A) {
								case 1:
									numero2 = (numero * 35);
									costoL2[i]+=numero2;
									cAgregar2 += 1;
									duracionL2[i]+=numero;
									break;
									
								case 2:
									numero2 = (numero * 380);
									costoL2[i]+=numero2;
									cAgregar2 += 1;
									duracionL2[i]+=numero;
									break;
									
								case 3:
									numero2 = (numero * 999);
									costoL2[i]+=numero2;
									cAgregar2 += 1;
									duracionL2[i]+=numero;
									break;
								
								default:
									cout <<"La opcion seleccionada no es valida, vuelve a intentarlo"<<endl;
							}
							
							
							break;
						case 3:
							cout<<"||================================================================================================||"<<endl;
  							cout<<"                               TIPO DE LLAMADA                                                      "<<endl;
  	 						cout<<"||================================================================================================||"<<endl;
  							cout<<"||                              1. Llamada local                                                  ||"<<endl;
  							cout<<"||                              2. Llamada a larga distancia                                      ||"<<endl;
  							cout<<"||                              3. Llamada a celular                                              ||"<<endl;
  							cout<<"||                                                                                                ||"<<endl;
  							cout<<"||                                                                                                ||"<<endl;
  							cout<<"||================================================================================================||"<<endl;
  							cout<<" Para seleccionar el tipo de llamada que desea realizar, por favor, ingrese un numero dentro del rango (1-3) : "<<endl;
							cin >> A;
							if (horas!=0){
	    
	                        cout <<"  Horas: "<<endl;
							cin >> horas;
								horas*=60;
							}else if (horas=0){
								horas=0;
							}
	
							cout <<"  Minutos: "<<endl;
							cin >> minutos;
	
				
							numero=horas+minutos;
							
							switch (A) {
								case 1:
									numero3 = (numero * 35);
									costoL3[i]+=numero3;
									cAgregar3 += 1;
									duracionL3[i]+=numero;
									break;
									
								case 2:
									numero3 = (numero * 380);
									costoL3[i]+=numero3;
									cAgregar3 += 1;
									duracionL3[i]+=numero;
									break;
									
								case 3:
									numero3 = (numero * 999);
									costo3 = numero3;
									cAgregar3 += 1;
									duracionL3[i]+=numero;
									break;
								
								default:
									cout <<"La opcion seleccionada no es valida, vuelve a intentarlo"<<endl;
									break;
							}
							
							break;
					}
				break;	
				}
				
				cout << "Has terminado de utilizar las lineas telefonicas, vuelve pronto"<<endl;
							 
				break;
				
			case 2:
			do {
				
			cout<<"||================================================================================================||"<<endl;
  			cout<<"                               SEA BIENVENIDO A LAS LINEAS TELEFONICAS                              "<<endl;
  			cout<<"||================================================================================================||"<<endl;
  			cout<<"||                              1. Linea Telefonica Primaria                                      ||"<<endl;
 		 	cout<<"||                              2. Linea Telefonica Secundaria                                    ||"<<endl;
  			cout<<"||                              3. Linea Telefonica Terciaria                                     ||"<<endl;
  			cout<<"||                              4. Terminar                                                       ||"<<endl;
  			cout<<"||                                                                                                ||"<<endl;
  			cout<<"||================================================================================================||"<<endl;
 		 	cout<<" Para seleccionar la linea que desea visualizar, por favor, ingrese un numero dentro del rango (1-3) : "<<endl;
  			cin >> U;
  			
  			
  				switch (U){
  					case 1:
  					for(i=0;i<100;i++){
								total1+=duracionL1[i];
								
							}
							for(i=0;i<100;i++){
								costo1+=costoL1[i];
								
							}
  						cout << "El numero total de llamadas es "<<endl<<cAgregar1<<endl;
						cout << "La duracion total es"<<endl<< total1<<endl<< "El costo total es"<<endl<<costo1<<endl;
  						break;
  					case 2:
  					for(i=0;i<100;i++){
								total2+=duracionL2[i];
								
							}
							for(i=0;i<100;i++){
								costo2+=costoL2[i];
  						
						  }
						cout << "El numero total de llamadas es"<<endl<<cAgregar2;
						cout << "La duracion total es"<<endl<< total2<<endl<< "El costo total es"<<endl<<costo2<<endl;
  						break;
  					case 3:
  					for(i=0;i<100;i++){
								total3+=duracionL3[i];
								
							}
							for(i=0;i<100;i++){
								costo3+=costoL3[i];
								
							}
  						cout << "El numero total de llamadas es"<<endl<<cAgregar3;
						cout << "La duracion total es"<<endl<< total3<<endl<< "El costo total es"<<endl<<costo3<<endl;
  						break;
  						
  					default:
					  cout <<"La opcion digitada no esta en el menu, intentelo mas tarde"<<endl; 
				  }
			
			} while (U != 4);
			  cout << "Has terminado de visulizar las lineas telefonicas, vuelva pronto"<<endl;
  			
				break;
				
			case 3:
					for(i=0;i<100;i++){
								total1+=duracionL1[i];
								
							}
							for(i=0;i<100;i++){
								costo1+=costoL1[i];
								
							}
							
				for(i=0;i<100;i++){
								total2+=duracionL2[i];
								
							}
							for(i=0;i<100;i++){
								costo2+=costoL2[i];
								
							}
				for(i=0;i<100;i++){
								total3+=duracionL3[i];
								
							}
							for(i=0;i<100;i++){
								costo3+=costoL3[i];
								
							}
			ctotal=costo1+costo2+costo3;
		    dtotal=total1+total2+total3;
				
				cout<<"||================================================================================================||"<<endl;
  				cout<<"                                         CONSOLIDACION                                              "<<endl;
  				cout<<"||================================================================================================||"<<endl;
  				cout<<"||                              1. Numero de llamadas : "<<cAgregar1 + cAgregar2 + cAgregar3<<"   ||"<<endl;
  				cout<<"||                              2. Duracion total :    "<<dtotal<<"                               ||"<<endl;
  				cout<<"||                              3. Costo total :  "<<ctotal                  <<"                  ||"<<endl;
  				cout<<"||                              4. Costo promedio por minuto : "<<(ctotal/numero)<< "             ||"<<endl;
  				cout<<"||                                                                                                ||"<<endl;
  				cout<<"||================================================================================================||"<<endl;  
  				
				break;
				
			case 4:
				cAgregar1 = 0;
				cAgregar2 = 0;
				cAgregar3 = 0;
				duracionL1 [100] = {0};
				costoL1 [100] = {0};
				duracionL2 [100] = {0};
				costoL2 [100] = {0};
				duracionL3 [100] = {0};
				costoL3 [100] = {0};
				total1 = 0;
				total2 = 0;
				total3 = 0;
				costo1 = 0;
				costo2 = 0;
				costo3 = 0;
				
				cout << "Se han reiniciado las lineas telefonicas"<<endl;
				break;
			
			case 5 :
			
			cout << "Has terminado de utilizar nuestras lineas telefonicas, vuelve pronto."<<endl;
			break;
			
			default:
				cout <<"Se ha detectado un error, intentelo mas tarde"<<endl;
				break;
		}
		} while (opcionu != 5);

	
	
	getch ();
	return 0;
}
