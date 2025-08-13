export declare class RulesExamplesService {
  getBeautySalonExamples(): {
    cancellationPolicy: {
      id: string;
      name: string;
      description: string;
      freeWindow: {
        amount: number;
        unit: string;
      };
      penalties: {
        timeFrame: {
          start: number;
          end: number;
        };
        penalty: {
          type: string;
          amount: number;
        };
        description: string;
      }[];
      emergencyExceptions: boolean;
      clientTierExceptions: string[];
      refundPolicy: {
        withinFreeWindow: number;
        afterFreeWindow: number;
        noShow: number;
        emergencyRefund: number;
      };
    };
    advanceBooking: {
      id: string;
      name: string;
      minimumAdvance: {
        amount: number;
        unit: string;
      };
      maximumAdvance: {
        amount: number;
        unit: string;
      };
      sameDayBooking: {
        allowed: boolean;
        cutoffTime: string;
        emergencySlots: boolean;
      };
      serviceOverrides: {
        serviceId: string;
        minimumAdvance: {
          amount: number;
          unit: string;
        };
      }[];
    };
    availability: {
      professionalId: string;
      regularHours: {
        tuesday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: {
            start: string;
            end: string;
          }[];
          isWorkingDay: boolean;
        };
        wednesday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: {
            start: string;
            end: string;
          }[];
          isWorkingDay: boolean;
        };
        thursday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: {
            start: string;
            end: string;
          }[];
          isWorkingDay: boolean;
          notes: string;
        };
        friday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: {
            start: string;
            end: string;
          }[];
          isWorkingDay: boolean;
        };
        saturday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: {
            start: string;
            end: string;
          }[];
          isWorkingDay: boolean;
          notes: string;
        };
      };
      seasonalPatterns: {
        name: string;
        period: {
          startDate: Date;
          endDate: Date;
        };
        schedule: {
          monday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: {
              start: string;
              end: string;
            }[];
            isWorkingDay: boolean;
            notes: string;
          };
        };
      }[];
    };
    serviceDurations: {
      serviceId: string;
      serviceName: string;
      defaultDuration: number;
      minimumDuration: number;
      maximumDuration: number;
      allowCustomDuration: boolean;
      incrementSize: number;
    }[];
    bufferTimes: {
      beforeAppointment: {
        duration: number;
        purpose: string;
        required: boolean;
      };
      afterAppointment: {
        duration: number;
        purpose: string;
        required: boolean;
      };
      serviceSpecific: {
        serviceId: string;
        beforeBuffer: number;
        afterBuffer: number;
        reason: string;
      }[];
    };
    specialRules: (
      | {
          id: string;
          name: string;
          type: string;
          priority: number;
          applicability: {
            clientTypes: string[];
            dateRanges?: undefined;
          };
          effect: {
            type: string;
            notification: {
              recipients: string[];
              message: string;
              urgent: boolean;
            };
            availabilityModification?: undefined;
          };
        }
      | {
          id: string;
          name: string;
          type: string;
          priority: number;
          applicability: {
            dateRanges: {
              startDate: Date;
              endDate: Date;
            }[];
            clientTypes?: undefined;
          };
          effect: {
            type: string;
            availabilityModification: {
              extendHours: {
                start: string;
                end: string;
              }[];
            };
            notification?: undefined;
          };
        }
    )[];
  };
  getMedicalClinicExamples(): {
    cancellationPolicy: {
      id: string;
      name: string;
      description: string;
      freeWindow: {
        amount: number;
        unit: string;
      };
      penalties: {
        timeFrame: {
          start: number;
          end: number;
        };
        penalty: {
          type: string;
          amount: number;
        };
        description: string;
      }[];
      emergencyExceptions: boolean;
      clientTierExceptions: never[];
      refundPolicy: {
        withinFreeWindow: number;
        afterFreeWindow: number;
        noShow: number;
        emergencyRefund: number;
      };
    };
    advanceBooking: {
      id: string;
      name: string;
      minimumAdvance: {
        amount: number;
        unit: string;
      };
      maximumAdvance: {
        amount: number;
        unit: string;
      };
      sameDayBooking: {
        allowed: boolean;
        emergencySlots: boolean;
      };
      serviceOverrides: {
        serviceId: string;
        minimumAdvance: {
          amount: number;
          unit: string;
        };
      }[];
    };
    availability: {
      professionalId: string;
      regularHours: {
        monday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: {
            start: string;
            end: string;
          }[];
          isWorkingDay: boolean;
        };
        tuesday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: {
            start: string;
            end: string;
          }[];
          isWorkingDay: boolean;
        };
        wednesday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: never[];
          isWorkingDay: boolean;
          notes: string;
        };
        thursday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: {
            start: string;
            end: string;
          }[];
          isWorkingDay: boolean;
        };
        friday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: {
            start: string;
            end: string;
          }[];
          isWorkingDay: boolean;
        };
      };
    };
    serviceDurations: {
      serviceId: string;
      serviceName: string;
      defaultDuration: number;
      minimumDuration: number;
      maximumDuration: number;
      allowCustomDuration: boolean;
      incrementSize: number;
    }[];
    bufferTimes: {
      beforeAppointment: {
        duration: number;
        purpose: string;
        required: boolean;
      };
      afterAppointment: {
        duration: number;
        purpose: string;
        required: boolean;
      };
      serviceSpecific: {
        serviceId: string;
        beforeBuffer: number;
        afterBuffer: number;
        reason: string;
      }[];
    };
    specialRules: {
      id: string;
      name: string;
      type: string;
      priority: number;
      applicability: {
        timeSlots: {
          start: string;
          end: string;
        }[];
      };
      effect: {
        type: string;
        approvalRequirement: {
          level: string;
          reason: string;
        };
      };
    }[];
  };
  getFitnessStudioExamples(): {
    cancellationPolicy: {
      id: string;
      name: string;
      description: string;
      freeWindow: {
        amount: number;
        unit: string;
      };
      penalties: {
        timeFrame: {
          start: number;
          end: number;
        };
        penalty: {
          type: string;
          amount: number;
        };
        description: string;
      }[];
      emergencyExceptions: boolean;
      refundPolicy: {
        withinFreeWindow: number;
        afterFreeWindow: number;
        noShow: number;
        emergencyRefund: number;
      };
    };
    advanceBooking: {
      id: string;
      name: string;
      minimumAdvance: {
        amount: number;
        unit: string;
      };
      maximumAdvance: {
        amount: number;
        unit: string;
      };
      sameDayBooking: {
        allowed: boolean;
        cutoffTime: string;
      };
    };
    availability: {
      professionalId: string;
      regularHours: {
        monday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: never[];
          isWorkingDay: boolean;
          notes: string;
        };
        wednesday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: never[];
          isWorkingDay: boolean;
        };
        friday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: never[];
          isWorkingDay: boolean;
        };
        saturday: {
          workingHours: {
            start: string;
            end: string;
          }[];
          breaks: {
            start: string;
            end: string;
          }[];
          isWorkingDay: boolean;
          notes: string;
        };
      };
    };
    serviceDurations: {
      serviceId: string;
      serviceName: string;
      defaultDuration: number;
      minimumDuration: number;
      maximumDuration: number;
      allowCustomDuration: boolean;
      incrementSize: number;
    }[];
  };
  getRuleTemplate(ruleType: string): any;
  private getCancellationRuleTemplate;
  private getAdvanceBookingRuleTemplate;
  private getAvailabilityRuleTemplate;
  private getDurationRuleTemplate;
  private getBufferTimeRuleTemplate;
  private getSpecialRuleTemplate;
  getAllIndustryExamples(): {
    beautySalon: {
      cancellationPolicy: {
        id: string;
        name: string;
        description: string;
        freeWindow: {
          amount: number;
          unit: string;
        };
        penalties: {
          timeFrame: {
            start: number;
            end: number;
          };
          penalty: {
            type: string;
            amount: number;
          };
          description: string;
        }[];
        emergencyExceptions: boolean;
        clientTierExceptions: string[];
        refundPolicy: {
          withinFreeWindow: number;
          afterFreeWindow: number;
          noShow: number;
          emergencyRefund: number;
        };
      };
      advanceBooking: {
        id: string;
        name: string;
        minimumAdvance: {
          amount: number;
          unit: string;
        };
        maximumAdvance: {
          amount: number;
          unit: string;
        };
        sameDayBooking: {
          allowed: boolean;
          cutoffTime: string;
          emergencySlots: boolean;
        };
        serviceOverrides: {
          serviceId: string;
          minimumAdvance: {
            amount: number;
            unit: string;
          };
        }[];
      };
      availability: {
        professionalId: string;
        regularHours: {
          tuesday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: {
              start: string;
              end: string;
            }[];
            isWorkingDay: boolean;
          };
          wednesday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: {
              start: string;
              end: string;
            }[];
            isWorkingDay: boolean;
          };
          thursday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: {
              start: string;
              end: string;
            }[];
            isWorkingDay: boolean;
            notes: string;
          };
          friday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: {
              start: string;
              end: string;
            }[];
            isWorkingDay: boolean;
          };
          saturday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: {
              start: string;
              end: string;
            }[];
            isWorkingDay: boolean;
            notes: string;
          };
        };
        seasonalPatterns: {
          name: string;
          period: {
            startDate: Date;
            endDate: Date;
          };
          schedule: {
            monday: {
              workingHours: {
                start: string;
                end: string;
              }[];
              breaks: {
                start: string;
                end: string;
              }[];
              isWorkingDay: boolean;
              notes: string;
            };
          };
        }[];
      };
      serviceDurations: {
        serviceId: string;
        serviceName: string;
        defaultDuration: number;
        minimumDuration: number;
        maximumDuration: number;
        allowCustomDuration: boolean;
        incrementSize: number;
      }[];
      bufferTimes: {
        beforeAppointment: {
          duration: number;
          purpose: string;
          required: boolean;
        };
        afterAppointment: {
          duration: number;
          purpose: string;
          required: boolean;
        };
        serviceSpecific: {
          serviceId: string;
          beforeBuffer: number;
          afterBuffer: number;
          reason: string;
        }[];
      };
      specialRules: (
        | {
            id: string;
            name: string;
            type: string;
            priority: number;
            applicability: {
              clientTypes: string[];
              dateRanges?: undefined;
            };
            effect: {
              type: string;
              notification: {
                recipients: string[];
                message: string;
                urgent: boolean;
              };
              availabilityModification?: undefined;
            };
          }
        | {
            id: string;
            name: string;
            type: string;
            priority: number;
            applicability: {
              dateRanges: {
                startDate: Date;
                endDate: Date;
              }[];
              clientTypes?: undefined;
            };
            effect: {
              type: string;
              availabilityModification: {
                extendHours: {
                  start: string;
                  end: string;
                }[];
              };
              notification?: undefined;
            };
          }
      )[];
    };
    medicalClinic: {
      cancellationPolicy: {
        id: string;
        name: string;
        description: string;
        freeWindow: {
          amount: number;
          unit: string;
        };
        penalties: {
          timeFrame: {
            start: number;
            end: number;
          };
          penalty: {
            type: string;
            amount: number;
          };
          description: string;
        }[];
        emergencyExceptions: boolean;
        clientTierExceptions: never[];
        refundPolicy: {
          withinFreeWindow: number;
          afterFreeWindow: number;
          noShow: number;
          emergencyRefund: number;
        };
      };
      advanceBooking: {
        id: string;
        name: string;
        minimumAdvance: {
          amount: number;
          unit: string;
        };
        maximumAdvance: {
          amount: number;
          unit: string;
        };
        sameDayBooking: {
          allowed: boolean;
          emergencySlots: boolean;
        };
        serviceOverrides: {
          serviceId: string;
          minimumAdvance: {
            amount: number;
            unit: string;
          };
        }[];
      };
      availability: {
        professionalId: string;
        regularHours: {
          monday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: {
              start: string;
              end: string;
            }[];
            isWorkingDay: boolean;
          };
          tuesday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: {
              start: string;
              end: string;
            }[];
            isWorkingDay: boolean;
          };
          wednesday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: never[];
            isWorkingDay: boolean;
            notes: string;
          };
          thursday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: {
              start: string;
              end: string;
            }[];
            isWorkingDay: boolean;
          };
          friday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: {
              start: string;
              end: string;
            }[];
            isWorkingDay: boolean;
          };
        };
      };
      serviceDurations: {
        serviceId: string;
        serviceName: string;
        defaultDuration: number;
        minimumDuration: number;
        maximumDuration: number;
        allowCustomDuration: boolean;
        incrementSize: number;
      }[];
      bufferTimes: {
        beforeAppointment: {
          duration: number;
          purpose: string;
          required: boolean;
        };
        afterAppointment: {
          duration: number;
          purpose: string;
          required: boolean;
        };
        serviceSpecific: {
          serviceId: string;
          beforeBuffer: number;
          afterBuffer: number;
          reason: string;
        }[];
      };
      specialRules: {
        id: string;
        name: string;
        type: string;
        priority: number;
        applicability: {
          timeSlots: {
            start: string;
            end: string;
          }[];
        };
        effect: {
          type: string;
          approvalRequirement: {
            level: string;
            reason: string;
          };
        };
      }[];
    };
    fitnessStudio: {
      cancellationPolicy: {
        id: string;
        name: string;
        description: string;
        freeWindow: {
          amount: number;
          unit: string;
        };
        penalties: {
          timeFrame: {
            start: number;
            end: number;
          };
          penalty: {
            type: string;
            amount: number;
          };
          description: string;
        }[];
        emergencyExceptions: boolean;
        refundPolicy: {
          withinFreeWindow: number;
          afterFreeWindow: number;
          noShow: number;
          emergencyRefund: number;
        };
      };
      advanceBooking: {
        id: string;
        name: string;
        minimumAdvance: {
          amount: number;
          unit: string;
        };
        maximumAdvance: {
          amount: number;
          unit: string;
        };
        sameDayBooking: {
          allowed: boolean;
          cutoffTime: string;
        };
      };
      availability: {
        professionalId: string;
        regularHours: {
          monday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: never[];
            isWorkingDay: boolean;
            notes: string;
          };
          wednesday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: never[];
            isWorkingDay: boolean;
          };
          friday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: never[];
            isWorkingDay: boolean;
          };
          saturday: {
            workingHours: {
              start: string;
              end: string;
            }[];
            breaks: {
              start: string;
              end: string;
            }[];
            isWorkingDay: boolean;
            notes: string;
          };
        };
      };
      serviceDurations: {
        serviceId: string;
        serviceName: string;
        defaultDuration: number;
        minimumDuration: number;
        maximumDuration: number;
        allowCustomDuration: boolean;
        incrementSize: number;
      }[];
    };
  };
  getRecommendedRules(businessType: string): any;
}
//# sourceMappingURL=rules-examples.service.d.ts.map
