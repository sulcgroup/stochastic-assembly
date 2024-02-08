include(FetchContent)

set(
        polycube_source_files
        Polycube.cpp
        CubeType.cpp
        PolycubesSimulation.cpp
        utils.cpp
        Patch.cpp
        Face.cpp
        CubeInstance.cpp
        Effect.cpp
        PolycubesProgram.cpp
        Move.cpp
        SimulationMove.cpp
        SolveSpec.cpp
        PolycubesAssemblyGraph.cpp
)

set(
        polycube_header_files
        Polycube.h
        CubeType.h
        PolycubesSimulation.h
        utils.h
        Face.h
        CubeInstance.h
        Effect.h
        PolycubesProgram.h
        SimulationMove.h
        SolveSpec.h
        PolycubesAssemblyGraph.h)

add_compile_options(-pthread)

add_executable(polycubes ${polycube_source_files} ${polycube_header_files})
target_include_directories(polycubes PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})


# Link Eigen
find_package (Eigen3 3.3 REQUIRED NO_MODULE)
target_link_libraries (polycubes Eigen3::Eigen)

## HDFQL
#set(HDFQL_ROOT "~/hdfql-2.4.0")
#include_directories(${HDFQL_ROOT}/include)
#find_library(HDFQL_LIB HDFql)
#
#target_include_directories(polycubes
#    PUBLIC "${HDFQL_ROOT}/include"
#)
#
## Link HDFql
#target_link_libraries(
#    polycubes
#   "${HDFQL_ROOT}/wrapper/cpp/libHDFql.so"
#)

# Boost regex
find_package(Boost REQUIRED COMPONENTS regex graph)
target_include_directories(polycubes PRIVATE ${Boost_INCLUDE_DIRS})
target_link_libraries(polycubes ${Boost_LIBRARIES})

## Include cryptominisat
#set(CRYPTOMINISAT_ROOT "~/cryptominisat-5.8.0")
#set(cryptominisat5_DIR "${CRYPTOMINISAT_ROOT}/build") # makes cmake run propetly on my laptop
#target_include_directories(polycubes PRIVATE ${CRYPTOMINISAT_ROOT}/build/include)
#find_package(cryptominisat5 REQUIRED NO_DEFAULT_PATH)
#target_link_libraries(polycubes cryptominisat5)

# Include nlohmann json
FetchContent_Declare(json URL https://github.com/nlohmann/json/releases/download/v3.10.5/json.tar.xz)
FetchContent_MakeAvailable(json)
target_link_libraries(polycubes nlohmann_json::nlohmann_json)

# spdlog
find_package(spdlog REQUIRED COMPONENTS spdlog)
target_link_libraries(polycubes spdlog::spdlog)