cmake_minimum_required(VERSION 3.13)
project(polycubes LANGUAGES CXX)

include_directories(~/anaconda3/include/pybind11)
find_package(Python COMPONENTS Interpreter Development REQUIRED)
find_package(pybind11 CONFIG REQUIRED)
find_package (Eigen3 3.3 REQUIRED)


add_library(polycubes MODULE
        polycubesPython.cpp
        )
target_link_libraries(polycubes pybind11::module Eigen3::Eigen)
set_target_properties(polycubes PROPERTIES CXX_VISIBILITY_PRESET "hidden" CUDA_VISIBILITY_PRESET "hidden")

# Link HDFql
# HDFQL
set(HDFQL_ROOT "~/hdfql-2.4.0")
include_directories(${HDFQL_ROOT}/include)
find_library(HDFQL_LIB HDFql)

target_include_directories(polycubes
PUBLIC "${HDFQL_ROOT}/include"
)

# Boost regex
find_package(Boost REQUIRED COMPONENTS regex)
include_directories(${Boost_INCLUDE_DIRS})
target_link_libraries(polycubes ${Boost_LIBRARIES})