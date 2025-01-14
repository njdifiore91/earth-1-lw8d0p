# WHY - Vision & Purpose

## Purpose & Users

This application serves as a browser-based platform that enables customers to match their Earth observation requirements with Matter's satellite data products. It helps users visualize, plan, and reserve satellite data collections based on their specific needs.

Target Users:

- Commercial customers seeking satellite imagery data

- Organizations requiring Earth observation data for asset monitoring

- Environmental monitoring agencies needing methane detection

- Matter internal administrators managing customer requests

Value Proposition: Provides an intuitive interface for users to define exact observation requirements, visualize collection opportunities, and understand product capabilities without requiring deep technical expertise in satellite operations.

# WHAT - Core Requirements

## Functional Requirements

System must:

1. User Authentication & Management

- Implement secure user registration and login

- Support different user roles (customers, internal administrators)

- Allow users to save and manage their queries

- Enable administrators to view all user queries and results

2. Location Input & Visualization

- Accept location input via KML file upload or manual entry

- Parse and validate KML files for points and polygons

- Display locations on an interactive global map

- Support geocoding of text-based location descriptions

3. Asset Definition & Requirements

- Provide a searchable dropdown of predefined assets (trees, methane, roofs, etc.)

- Accept custom text input for asset descriptions

- Collect detection requirements (e.g., methane MDL, mineral deposit size)

- Implement intelligent prompting for additional information based on asset type

4. Collection Planning

- Calculate optimal imaging parameters based on user requirements

- Handle targets larger than satellite swath width

- Interface with EARTH-n simulator or query pre-computed results

- Generate satellite access schedules

- Recommend optimal imaging modes for specific assets

5. Results Display

- Show collection opportunities on interactive map

- Display time tables of satellite access times

- Provide detailed capability descriptions for selected applications

- Generate adjacent application recommendations

- Save all search results in backend database

6. Call-to-Action Integration

- Display prominent meeting/contact form options

- Integrate special post-search CTAs

- Save lead generation data

# HOW - Planning & Implementation

## Technical Foundation

### Required Stack Components

Frontend:

- Web application with interactive mapping interface (e.g., Mapbox)

- Modern JavaScript framework for reactive UI

- Data visualization libraries for timelines and schedules

Backend:

- Secure authentication system

- KML parsing and validation service

- Geocoding service integration

- Database for user data and search history

- Integration with EARTH-n simulator or pre-computed results database

### System Requirements

Performance:

- Map interaction response time \< 100ms

- Search results generation \< 3 seconds

- KML file parsing \< 5 seconds for files up to 10MB

Security:

- Secure user authentication

- Encrypted data transmission

- Protected API endpoints

- Secure storage of user data

Scalability:

- Support for multiple concurrent users

- Efficient handling of large KML files

- Optimized database queries for search history

## User Experience

### Key User Flows

1. New Search Flow:

- User logs in

- Enters location (KML or manual)

- Defines assets and requirements

- Reviews recommended collection parameters

- Views schedule and capabilities

- Saves search or proceeds to CTA

2. Administrator Flow:

- Access user search history

- View all saved queries

- Export user data

- Manage system parameters

### Core Interfaces

1. Main Search Interface:

- Interactive global map

- Search/input panel

- Asset selection tools

- Requirements input forms

2. Results Dashboard:

- Collection schedule visualization

- Capability descriptions

- Adjacent application suggestions

- CTA buttons

3. User Management Interface:

- Saved searches

- Profile management

- Administrative controls (admin only)

## Business Requirements

### Access & Authentication

- Customer accounts with saved search history

- Administrative accounts with full system access

- Secure API access for EARTH-n simulator integration

### Business Rules

- All user searches must be logged and retained

- Users can delete their visible queries, but data remains in backend

- Required fields must be validated before processing

- Automatic detection of target sizes exceeding swath width

- Clear display of product capabilities and limitations

## Implementation Priorities

High Priority:

- User authentication system

- Location input and visualization

- Basic search functionality

- Collection planning algorithms

- Results display

Medium Priority:

- Advanced KML handling

- Adjacent application recommendations

- Search history management

- Administrative interface

Lower Priority:

- Advanced visualization options

- Additional export formats

- Enhanced recommendation engine